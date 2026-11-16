import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";
const userId="550e8400-e29b-41d4-a716-446655440000", giftId="650e8400-e29b-41d4-a716-446655440001", instanceId="750e8400-e29b-41d4-a716-446655440002";
const operationId="950e8400-e29b-41d4-a716-446655440004", recipientId="a50e8400-e29b-41d4-a716-446655440005";
const session={userId,sessionToken:"fixture-player-session"}, issuedAt="2026-11-16T10:00:00.000Z";
const send={...session,operationId,issuedAt,recipientId,instanceId,expectedInventoryRevision:7,expectedConfigRevision:Number.MAX_SAFE_INTEGER};
const decline={...session,giftId,expectedGiftRevision:1};
const itemReference={instanceId,itemKey:"sword"};
const gift={id:giftId,revision:1,senderId:recipientId,recipientId:userId,returnOwnerId:recipientId,itemReference,currencyKey:"gold",fee:Number.MAX_SAFE_INTEGER,configRevision:3,status:"offered",createdAt:issuedAt,expiresAt:"2026-11-23T10:00:00.000Z",terminalAt:null,declinedAt:null,offerEntryId:"message:"+operationId,returnEntryId:null,ownerUnavailable:false};
const snapshot={gift,serverTime:issuedAt};
let client:Client; let request:ReturnType<typeof vi.fn>;
beforeEach(async()=>{
 vi.stubEnv("HORIZON_API_KEY","fixture-app-key");vi.stubEnv("HORIZON_ACCOUNT_API_KEY","fixture-account-key");vi.stubEnv("HORIZON_BASE_URL","http://fixture.invalid");
 vi.spyOn(console,"error").mockImplementation(()=>{});request=vi.fn(async()=>new Response(JSON.stringify(snapshot)));vi.stubGlobal("fetch",request);
 client=new Client({name:"item-gifts-test",version:"1"});const[a,b]=InMemoryTransport.createLinkedPair();await Promise.all([createServer().connect(b),client.connect(a)]);
});
afterEach(async()=>{await client?.close();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
const call=(name:string,args:Record<string,unknown>)=>client.callTool({name:"horizon_"+name,arguments:args});
const calls=()=>request.mock.calls as unknown as [string,RequestInit][];
const payload=(r:Awaited<ReturnType<typeof call>>)=>JSON.parse((r.content as {text:string}[])[0].text);
describe("item gifts through real MCP protocol",()=>{
 it("maps all six player routes with player-only credentials and original body fields",async()=>{
  expect(payload(await call("get_item_gift_config",session))).toEqual(snapshot);
  await call("get_item_gifts",session);await call("send_item_gift",send);await call("get_item_gift_operation",{...session,operationId});
  await call("get_item_gift",{...session,giftId});await call("decline_item_gift",decline);
  const b="/api/v1/app/item-gifts";
  expect(calls().map(([u,o])=>[o.method,new URL(u).pathname])).toEqual([["GET",b+"/config"],["GET",b],["POST",b],["GET",b+"/operations/"+operationId],["GET",b+"/"+giftId],["POST",b+"/"+giftId+"/decline"]]);
  const {sessionToken:_s,...sendBody}=send;expect(JSON.parse(calls()[2][1].body as string)).toEqual(sendBody);
  expect(Object.keys(JSON.parse(calls()[2][1].body as string))).toHaveLength(7);
  expect(JSON.parse(calls()[5][1].body as string)).toEqual({userId,expectedGiftRevision:1});
  for(const[url,o]of calls()){
   expect(o.headers).toMatchObject({"X-API-Key":"fixture-app-key",Authorization:"Bearer fixture-player-session"});expect(o.headers).not.toHaveProperty("X-Account-API-Key");expect(o.headers).not.toHaveProperty("If-Match");expect(url).not.toContain(session.sessionToken);
   if(o.method==="GET")expect(Object.fromEntries(new URL(url).searchParams)).toEqual({userId});
  }
  expect(request).toHaveBeenCalledTimes(6);
 });
 it("rejects malformed original identities times revisions and self gifts before HTTP",async()=>{
  for(const changes of [{expectedInventoryRevision:-1},{expectedConfigRevision:1.5},{expectedConfigRevision:9007199254740992},{expectedInventoryRevision:"7"},{operationId:operationId.toUpperCase()},{recipientId:"not-a-uuid"},{issuedAt:"2026-02-30T01:02:03.004Z"},{issuedAt:"2026-11-16T10:00:00Z"},{sessionToken:undefined},{recipientId:userId}])
   expect((await call("send_item_gift",{...send,...changes})).isError).toBe(true);
  for(const changes of [{expectedGiftRevision:-1},{giftId:"x"},{expectedGiftRevision:undefined}])expect((await call("decline_item_gift",{...decline,...changes})).isError).toBe(true);
  expect((await call("get_item_gift_operation",{...session,operationId:"bad"})).isError).toBe(true);
  expect(request).not.toHaveBeenCalled();
 });
 it("keeps the original send intent through unknown replies errors and a regional host change",async()=>{
  request.mockImplementationOnce(async()=>{throw new Error("lost committed reply")});expect((await call("send_item_gift",send)).isError).toBe(true);
  for(const[status,code]of [[409,"STATE_CONFLICT"],[409,"OPERATION_EXPIRED"],[409,"RECIPIENT_INBOX_FULL"],[422,"INSUFFICIENT_BALANCE"],[429,"ITEM_GIFTS_RATE_LIMITED"],[403,"ITEM_GIFTS_DISABLED"]]as const){
   request.mockImplementationOnce(async()=>new Response(JSON.stringify({code}),{status}));const r=await call("send_item_gift",send);expect(r.isError).toBe(true);expect((r.content as {text:string}[])[0].text).toContain(code);
  }
  vi.stubEnv("HORIZON_BASE_URL","http://changed.invalid");const replay={receipt:{operationId,issuedAt,giftId,giftRevision:1,recordedAt:issuedAt,recipientId,itemReference,currencyKey:"gold",fee:5,configRevision:3},gift,replayed:true,serverTime:issuedAt};
  request.mockImplementationOnce(async()=>new Response(JSON.stringify(replay),{status:200}));expect(payload(await call("send_item_gift",send))).toEqual(replay);
  expect(calls().every(([,o])=>o.body===calls()[0][1].body)).toBe(true);expect(new URL(calls()[7][0]).hostname).toBe("changed.invalid");expect(request).toHaveBeenCalledTimes(8);
 });
 it("shows itemGift offer and return attachments in the Inbox and claims them through the Inbox claim",async()=>{
  const offer={id:"message:"+operationId,kind:"message",type:"item_gift",textKey:"horizon.item_gifts.offer",parameters:{senderId:recipientId},claimed:false,attachment:{values:[],itemGift:{giftId,instanceId,itemKey:"sword",direction:"offer"}}};
  const ret={...offer,type:"item_gift_return",textKey:"horizon.item_gifts.return",parameters:{recipientId,reason:"declined"},attachment:{values:[],itemGift:{giftId,instanceId,itemKey:"sword",direction:"return"}}};
  const inbox={entries:[offer,ret],serverTime:issuedAt};
  request.mockImplementationOnce(async()=>new Response(JSON.stringify(inbox)));expect(payload(await call("get_inbox",session))).toEqual(inbox);
  const claimed={entryId:offer.id,replayed:false,inbox,playerValues:{values:[]},items:[itemReference]};
  request.mockImplementationOnce(async()=>new Response(JSON.stringify(claimed)));expect(payload(await call("claim_inbox",{...session,entryId:offer.id}))).toEqual(claimed);
  request.mockImplementationOnce(async()=>new Response(JSON.stringify({code:"GIFT_EXPIRED"}),{status:409}));expect((await call("claim_inbox",{...session,entryId:offer.id})).isError).toBe(true);
  expect(new URL(calls()[1][0]).pathname).toBe("/api/v1/app/inbox/claim");expect(JSON.parse(calls()[1][1].body as string)).toEqual({userId,entryId:offer.id});expect(request).toHaveBeenCalledTimes(3);
 });
 it("exposes exactly six annotated tools plus resource and prompts and requires the project key",async()=>{
  const tools=(await client.listTools()).tools.filter(t=>t.name.includes("item_gift"));expect(tools.map(t=>t.name).sort()).toEqual(["horizon_decline_item_gift","horizon_get_item_gift","horizon_get_item_gift_config","horizon_get_item_gift_operation","horizon_get_item_gifts","horizon_send_item_gift"]);
  for(const name of ["send_item_gift","decline_item_gift"])expect(tools.find(t=>t.name==="horizon_"+name)?.annotations).toMatchObject({readOnlyHint:false,destructiveHint:true,idempotentHint:true});
  for(const name of ["get_item_gift_config","get_item_gifts","get_item_gift","get_item_gift_operation"])expect(tools.find(t=>t.name==="horizon_"+name)?.annotations).toMatchObject({readOnlyHint:true});
  expect((await client.readResource({uri:"horizon://docs/item-gifts"})).contents[0]).toMatchObject({text:expect.stringContaining("seven fields")});
  expect((await client.readResource({uri:"horizon://docs/inbox"})).contents[0]).toMatchObject({text:expect.stringContaining("attachment.itemGift")});
  for(const engine of ["unity","godot","unreal"])for(const name of ["integrate-feature","explain-feature"])expect((await client.getPrompt({name,arguments:{feature:"item-gifts",engine}})).messages[0].content).toMatchObject({text:expect.stringContaining("horizon://docs/item-gifts")});
  vi.stubEnv("HORIZON_API_KEY","");expect((await call("send_item_gift",send)).isError).toBe(true);expect(request).not.toHaveBeenCalled();
 });
});
