import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";
const userId="550e8400-e29b-41d4-a716-446655440000", listingId="650e8400-e29b-41d4-a716-446655440001", instanceId="750e8400-e29b-41d4-a716-446655440002";
const projectApiKeyId="850e8400-e29b-41d4-a716-446655440003", operationId="950e8400-e29b-41d4-a716-446655440004", recipientId="a50e8400-e29b-41d4-a716-446655440005";
const session={userId,sessionToken:"fixture-player-session"}, project={projectApiKeyId}, issuedAt="2026-10-16T01:02:03.004Z";
const create={...session,operationId,issuedAt,instanceId,expectedInventoryRevision:7,expectedConfigRevision:9,price:Number.MAX_SAFE_INTEGER,durationSeconds:604800};
const buy={...session,operationId,issuedAt,listingId,expectedListingRevision:1,expectedPrice:Number.MAX_SAFE_INTEGER,expectedCurrencyKey:"1coin.gold-x"};
const cancel={...session,operationId,issuedAt,listingId,expectedListingRevision:1};
const cursor=Buffer.from(projectApiKeyId+"|sword|0|9007199254740991|1|"+listingId).toString("base64url");
const snapshot={listing:{id:listingId,revision:Number.MAX_SAFE_INTEGER,item:{instanceId,itemKey:"sword",properties:{Name:"A\u0000😀",name:"case-distinct",number:Number.MAX_SAFE_INTEGER}}},serverTime:issuedAt};
let client:Client; let request:ReturnType<typeof vi.fn>;
beforeEach(async()=>{
 vi.stubEnv("HORIZON_API_KEY","fixture-app-key");vi.stubEnv("HORIZON_ACCOUNT_API_KEY","fixture-account-key");vi.stubEnv("HORIZON_BASE_URL","http://fixture.invalid");
 vi.spyOn(console,"error").mockImplementation(()=>{});request=vi.fn(async()=>new Response(JSON.stringify(snapshot)));vi.stubGlobal("fetch",request);
 client=new Client({name:"marketplace-test",version:"1"});const[a,b]=InMemoryTransport.createLinkedPair();await Promise.all([createServer().connect(b),client.connect(a)]);
});
afterEach(async()=>{await client?.close();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
const call=(name:string,args:Record<string,unknown>)=>client.callTool({name:"horizon_"+name,arguments:args});
const calls=()=>request.mock.calls as unknown as [string,RequestInit][];
const payload=(r:Awaited<ReturnType<typeof call>>)=>JSON.parse((r.content as {text:string}[])[0].text);
describe("marketplace through real MCP protocol",()=>{
 it("maps all ten player routes with player-only credentials and original body fields",async()=>{
  expect(payload(await call("get_marketplace_limits",session))).toEqual(snapshot);
  await call("get_marketplace_rules",{...session,after:"sword",limit:50,catalogRevision:9});await call("get_marketplace",session);
  await call("query_marketplace_listings",{...session,itemKey:"sword",minPrice:0,maxPrice:Number.MAX_SAFE_INTEGER,limit:50,cursor});
  await call("get_marketplace_listing",{...session,listingId});await call("create_marketplace_listing",create);await call("buy_marketplace_listing",buy);
  await call("cancel_marketplace_listing",cancel);await call("get_marketplace_operation",{...session,operationId});await call("retry_marketplace_return",{...session,listingId});
  const b="/api/v1/app/marketplace";
  expect(calls().map(([u,o])=>[o.method,new URL(u).pathname])).toEqual([["GET",b+"/limits"],["GET",b+"/rules"],["GET",b],["GET",b+"/listings"],["GET",b+"/listings/"+listingId],["POST",b+"/listings"],["POST",b+"/listings/"+listingId+"/buy"],["POST",b+"/listings/"+listingId+"/cancel"],["GET",b+"/operations/"+operationId],["POST",b+"/listings/"+listingId+"/retry-return"]]);
  const {sessionToken:_c,...createBody}=create;const {sessionToken:_b,listingId:_l,...buyBody}=buy;const {sessionToken:_s,listingId:_i,...cancelBody}=cancel;
  expect(JSON.parse(calls()[5][1].body as string)).toEqual(createBody);expect(JSON.parse(calls()[6][1].body as string)).toEqual(buyBody);expect(JSON.parse(calls()[7][1].body as string)).toEqual(cancelBody);expect(JSON.parse(calls()[9][1].body as string)).toEqual({userId});
  expect(Object.fromEntries(new URL(calls()[1][0]).searchParams)).toEqual({userId,after:"sword",limit:"50",catalogRevision:"9"});
  expect(new URL(calls()[3][0]).searchParams.get("cursor")).toBe(cursor);
  for(const[url,o]of calls()){
   expect(o.headers).toMatchObject({"X-API-Key":"fixture-app-key",Authorization:"Bearer fixture-player-session"});expect(o.headers).not.toHaveProperty("X-Account-API-Key");expect(o.headers).not.toHaveProperty("If-Match");expect(url).not.toContain(session.sessionToken);
   if(o.method==="GET")expect(new URL(url).searchParams.get("userId")).toBe(userId);
  }
  expect(request).toHaveBeenCalledTimes(10);
 });
 it("maps all fourteen scoped admin routes with explicit CAS nulls and empty bodies",async()=>{
  const note="Original 😀\nreview";const cases:[string,Record<string,unknown>,string,string,unknown?,boolean?][]=[
   ["config_get",{},"GET","/config"],["config_set",{expectedRevision:7,enabled:false,currencyKey:null,feeBps:null},"PUT","/config",{enabled:false,currencyKey:null,feeBps:null},true],
   ["limits_get",{},"GET","/limits"],["rules_list",{after:"sword",limit:50},"GET","/rules"],
   ["rule_set",{expectedRevision:7,itemKey:"sword",active:true,minPrice:1,maxPrice:Number.MAX_SAFE_INTEGER},"PUT","/rules/sword",{active:true,minPrice:1,maxPrice:Number.MAX_SAFE_INTEGER},true],
   ["listings_list",{status:"return_pending",cursor,limit:50},"GET","/listings"],["listing_get",{listingId},"GET","/listings/"+listingId],
   ["listing_cancel",{listingId,expectedRevision:7,note},"POST","/listings/"+listingId+"/cancel",{note},true],
   ["return_retry",{listingId},"POST","/listings/"+listingId+"/retry-return",{}],
   ["listing_recover",{listingId,expectedRevision:7,recipientId,note},"POST","/listings/"+listingId+"/recover",{recipientId,note},true],
   ["player_get",{userId},"GET","/players/"+userId],["moderation_get",{userId},"GET","/players/"+userId+"/moderation"],
   ["moderation_set",{userId,expectedRevision:7,banUntil:null,reason:""},"PUT","/players/"+userId+"/moderation",{banUntil:null,reason:""},true],
   ["cleanup",{},"POST","/cleanup",{}]
  ];
  for(const[name,args,method,path,body,cas]of cases){
   expect((await call("admin_marketplace_"+name,{...project,...args})).isError).not.toBe(true);const[url,o]=calls().at(-1)!;
   expect(new URL(url).pathname).toBe("/api/v1/admin/features/marketplace/"+projectApiKeyId+path);expect(o.method).toBe(method);
   expect(o.body===undefined?undefined:JSON.parse(o.body as string)).toEqual(body);
   expect(o.headers).toMatchObject({"X-Account-API-Key":"fixture-account-key"});expect(o.headers).not.toHaveProperty("Authorization");expect(o.headers).not.toHaveProperty("X-API-Key");
   if(cas)expect(o.headers).toHaveProperty("If-Match","7");else expect(o.headers).not.toHaveProperty("If-Match");
  }
  expect(new URL(calls()[3][0]).searchParams.get("after")).toBe("sword");expect(Object.fromEntries(new URL(calls()[5][0]).searchParams)).toEqual({status:"return_pending",cursor,limit:"50"});expect(request).toHaveBeenCalledTimes(14);
 });
 it("rejects malformed original identities times unsafe prices and contradictory inputs before HTTP",async()=>{
  for(const changes of [{price:0},{price:9007199254740992},{price:"1"},{expectedInventoryRevision:-1},{expectedConfigRevision:1.5},{durationSeconds:299},{durationSeconds:604801},{operationId:operationId.toUpperCase()},{issuedAt:"2026-02-30T01:02:03.004Z"},{issuedAt:"2026-10-16T01:02:03Z"},{sessionToken:undefined}])expect((await call("create_marketplace_listing",{...create,...changes})).isError).toBe(true);
  for(const currency of ["Gold","a".repeat(25),"a/b",null])expect((await call("buy_marketplace_listing",{...buy,expectedCurrencyKey:currency})).isError).toBe(true);
  for(const changes of [{minPrice:2,maxPrice:1},{limit:51},{cursor:"bad="},{itemKey:"sword.gold"}])expect((await call("query_marketplace_listings",{...session,...changes})).isError).toBe(true);
  for(const note of [" ","\ud800","\u0000","😀".repeat(241)])expect((await call("admin_marketplace_listing_recover",{...project,listingId,expectedRevision:1,recipientId,note})).isError).toBe(true);
  expect((await call("admin_marketplace_config_set",{...project,expectedRevision:1,enabled:true,currencyKey:null,feeBps:0})).isError).toBe(true);
  expect((await call("admin_marketplace_rule_set",{...project,expectedRevision:1,itemKey:"sword",active:true,minPrice:2,maxPrice:1})).isError).toBe(true);
  expect((await call("admin_marketplace_moderation_set",{...project,userId,expectedRevision:1,banUntil:issuedAt,reason:""})).isError).toBe(true);
  expect(request).not.toHaveBeenCalled();
 });
 it("keeps the original transaction through unknown replies errors and a regional host change",async()=>{
  request.mockImplementationOnce(async()=>{throw new Error("lost committed reply")});expect((await call("buy_marketplace_listing",buy)).isError).toBe(true);
  for(const[status,code]of [[409,"STATE_CONFLICT"],[409,"OPERATION_EXPIRED"],[409,"PRICE_CHANGED"],[422,"INVENTORY_FULL"],[429,"MARKETPLACE_RATE_LIMITED"],[503,"RESTORE_IN_PROGRESS"]]as const){
   request.mockImplementationOnce(async()=>new Response(JSON.stringify({code}),{status}));const r=await call("buy_marketplace_listing",buy);expect(r.isError).toBe(true);expect((r.content as {text:string}[])[0].text).toContain(code);
  }
  vi.stubEnv("HORIZON_BASE_URL","http://changed.invalid");const replay={receipt:{operationId,issuedAt,listingId,itemReference:{instanceId,itemKey:"sword"}},listing:null,replayed:true,serverTime:issuedAt};
  request.mockImplementationOnce(async()=>new Response(JSON.stringify(replay)));expect(payload(await call("buy_marketplace_listing",buy))).toEqual(replay);
  expect(calls().every(([,o])=>o.body===calls()[0][1].body)).toBe(true);expect(new URL(calls()[7][0]).hostname).toBe("changed.invalid");expect(request).toHaveBeenCalledTimes(8);
 });
 it("preserves empty continuation and original Unicode item data without polling or transformations",async()=>{
  const empty={listings:[],nextCursor:cursor,serverTime:issuedAt};request.mockImplementationOnce(async()=>new Response(JSON.stringify(empty)));
  expect(payload(await call("query_marketplace_listings",session))).toEqual(empty);
  expect(payload(await call("get_marketplace_listing",{...session,listingId}))).toEqual(snapshot);expect(request).toHaveBeenCalledTimes(2);
 });
 it("preserves trusted Inbox return and claim receipts including replay and full inventory",async()=>{
  const itemReturn={listingId,instanceId,itemKey:"sword"};const entryId="message:"+operationId;
  const inbox={entries:[{entryId,attachment:{values:[],itemReturn},claimedAt:null}],serverTime:issuedAt};
  request.mockImplementationOnce(async()=>new Response(JSON.stringify(inbox)));expect(payload(await call("get_inbox",session))).toEqual(inbox);
  const claimed={entryId,replayed:true,inbox,playerValues:{values:[]},items:[{instanceId,itemKey:"sword"}]};
  request.mockImplementationOnce(async()=>new Response(JSON.stringify(claimed)));expect(payload(await call("claim_inbox",{...session,entryId}))).toEqual(claimed);
  request.mockImplementationOnce(async()=>new Response(JSON.stringify({code:"INVENTORY_FULL"}),{status:422}));expect((await call("claim_inbox",{...session,entryId})).isError).toBe(true);
  expect(request).toHaveBeenCalledTimes(3);expect(JSON.parse(calls()[1][1].body as string)).toEqual({userId,entryId});
 });
 it("requires current credentials and exposes exactly twenty-four annotated tools plus resource and prompts",async()=>{
  const tools=(await client.listTools()).tools.filter(t=>t.name.includes("marketplace"));expect(tools).toHaveLength(24);
  for(const name of ["create_marketplace_listing","buy_marketplace_listing","cancel_marketplace_listing"])expect(tools.find(t=>t.name==="horizon_"+name)?.annotations).toMatchObject({readOnlyHint:false,destructiveHint:true,idempotentHint:true});
  expect(tools.find(t=>t.name==="horizon_admin_marketplace_cleanup")?.annotations).toMatchObject({readOnlyHint:false,destructiveHint:true,idempotentHint:false});
  expect((await client.readResource({uri:"horizon://docs/marketplace"})).contents[0]).toMatchObject({text:expect.stringContaining("Nonterminal escrow")});
  for(const engine of ["unity","godot","unreal"])for(const name of ["integrate-feature","explain-feature"])expect((await client.getPrompt({name,arguments:{feature:"marketplace",engine}})).messages[0].content).toMatchObject({text:expect.stringContaining("horizon://docs/marketplace")});
  vi.stubEnv("HORIZON_API_KEY","");expect((await call("create_marketplace_listing",create)).isError).toBe(true);
  vi.stubEnv("HORIZON_ACCOUNT_API_KEY","");expect((await call("admin_marketplace_config_get",project)).isError).toBe(true);expect(request).not.toHaveBeenCalled();
 });
});
