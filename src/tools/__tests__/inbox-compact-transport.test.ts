import { createServer as httpServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";

const projectApiKeyId = "11111111-1111-4111-8111-111111111111", userId = "22222222-2222-4222-8222-222222222222";
const operationId = "33333333-3333-4333-8333-333333333333", entryId = "message:44444444-4444-3444-8444-444444444444";
const intent = { projectApiKeyId, userId, operationId, expectedRevision: 17, issuedAt: "2026-10-17T12:00:00.000Z", expiresAt: "2026-10-27T12:00:00.000Z", freeText: "é".repeat(300) };
const entries = Array.from({length:552},(_,i)=>({id:`message:00000000-0000-4000-8000-${String(i).padStart(12,"0")}`,kind:"message",type:"group_invite",reference:operationId,textKey:"horizon.groups.invite",parameters:{groupId:operationId},read:false,claimed:false,overdue:false,attachment:null}));
const itemReturn = {listingId:operationId,instanceId:userId,itemKey:"seagull_hat"};
let client: Client, http: Server, bytes: number, revision: number, drop: boolean;
let accepted: string | null;
let requests: {path:string;body:Record<string,unknown>;headers:Record<string,unknown>}[];
const call=(name:string,args:Record<string,unknown>)=>client.callTool({name,arguments:args});
const data=(result:Awaited<ReturnType<typeof call>>)=>JSON.parse((result.content as {text:string}[])[0].text);

beforeEach(async()=>{
  bytes=1024;revision=17;drop=false;accepted=null;requests=[];
  vi.stubEnv("HORIZON_API_KEY","fixture-project-key");vi.stubEnv("HORIZON_ACCOUNT_API_KEY","fixture-account-key");
  vi.spyOn(console,"error").mockImplementation(()=>{});
  http=httpServer(async(req,res)=>{
    const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
    const body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
    requests.push({path:req.url!,body,headers:req.headers});res.setHeader("Content-Type","application/json");
    if(req.url==="/api/v1/admin/inbox/messages"){
      if(Buffer.byteLength(body.freeText)>bytes){res.statusCode=400;res.end(JSON.stringify({code:"INVALID_REQUEST"}));return;}
      if(accepted===JSON.stringify(body)){res.end(JSON.stringify({entryId,replayed:true}));return;}
      if(body.expectedRevision!==revision){res.statusCode=409;res.end(JSON.stringify({code:"REVISION_CONFLICT"}));return;}
      accepted=JSON.stringify(body);revision++;if(drop){drop=false;req.socket.destroy();return;}
      res.end(JSON.stringify({entryId,replayed:false}));return;
    }
    const snapshot={userId,cursor:"opaque",revision,broadcastRevision:4,serverTime:intent.issuedAt,pollAfterSeconds:120,unchanged:false,
      entries:[...entries,{id:entryId,kind:"message",type:"marketplace",reference:operationId,textKey:"marketplace.item_return",parameters:{},read:false,claimed:false,overdue:true,attachment:{values:[],itemReturn}}],
      counts:{group_invite:{total:552,unread:552,claimable:0},marketplace:{total:1,unread:1,claimable:1}},limits:{targeted:2,broadcasts:10,freeTexts:1,freeTextBytes:bytes,freeTextRetentionDays:14}};
    if(req.url==="/api/v1/app/inbox/claim"){res.end(JSON.stringify({entryId,replayed:true,inbox:snapshot,playerValues:{values:[]},items:[{instanceId:userId,itemKey:"seagull_hat"}]}));return;}
    res.end(JSON.stringify(snapshot));
  });
  await new Promise<void>(resolve=>http.listen(0,"127.0.0.1",resolve));vi.stubEnv("HORIZON_BASE_URL",`http://127.0.0.1:${(http.address() as {port:number}).port}`);
  client=new Client({name:"compact-inbox-http",version:"1"});const[a,b]=InMemoryTransport.createLinkedPair();await Promise.all([createServer().connect(b),client.connect(a)]);
});
afterEach(async()=>{await client.close();http.closeAllConnections();await new Promise<void>(resolve=>http.close(()=>resolve()));vi.unstubAllEnvs();vi.restoreAllMocks();});

describe("compact Inbox through actual MCP and loopback HTTP",()=>{
  it("forwards all seven immutable fields above old byte and retention defaults with account-only auth",async()=>{
    const result=await call("horizon_admin_inbox_send_ordinary",intent);expect(result.isError).not.toBe(true);expect(data(result)).toEqual({entryId,replayed:false});
    expect(requests).toHaveLength(1);const {projectApiKeyId:project,...original}=intent;expect(requests[0].body).toEqual({apiKeyId:project,...original});
    expect(requests[0].headers["x-account-api-key"]).toBe("fixture-account-key");expect(requests[0].headers.authorization).toBeUndefined();expect(requests[0].headers["x-api-key"]).toBeUndefined();
  });
  it("does not automatically retry a lost reply and preserves the original revision after newer limits",async()=>{
    drop=true;const first=await call("horizon_admin_inbox_send_ordinary",intent);expect(first.isError).toBe(true);expect(requests).toHaveLength(1);
    bytes=20;const current=data(await call("horizon_admin_inbox_player_get",{projectApiKeyId,userId}));expect(current.revision).toBe(18);expect(current.limits.freeTextBytes).toBe(20);
    const rejected=await call("horizon_admin_inbox_send_ordinary",structuredClone(intent));expect(rejected.isError).toBe(true);expect(JSON.stringify(rejected)).toContain("INVALID_REQUEST");
    bytes=1024;const replay=data(await call("horizon_admin_inbox_send_ordinary",structuredClone(intent)));expect(replay).toEqual({entryId,replayed:true});expect(requests[0].body).toEqual(requests[2].body);expect(requests[0].body).toEqual(requests[3].body);expect(requests).toHaveLength(4);
  });
  it("preserves all source entries, configured limits and item-return descriptors above lowered caps",async()=>{
    for(const [name,args] of [["horizon_get_inbox",{userId,sessionToken:"fixture-player"}],["horizon_admin_inbox_player_get",{projectApiKeyId,userId}]] as const){
      const snapshot=data(await call(name,args));expect(snapshot.entries).toHaveLength(553);expect(snapshot.limits.targeted).toBe(2);expect(snapshot.entries[552].attachment).toEqual({values:[],itemReturn});expect(snapshot.counts.group_invite.total).toBe(552);
    }
    const replay=data(await call("horizon_claim_inbox",{userId,sessionToken:"fixture-player",entryId}));expect(replay.replayed).toBe(true);expect(replay.items).toEqual([{instanceId:userId,itemKey:"seagull_hat"}]);expect(requests[2].body).toEqual({userId,entryId});expect(requests).toHaveLength(3);
  });
  it("rejects old localization envelopes, attachments, malformed text and unsafe revisions before HTTP",async()=>{
    for(const change of [{expectedRevision:undefined},{expectedRevision:-1},{expectedRevision:Number.MAX_SAFE_INTEGER+1},{freeText:" "},{freeText:"\uD800"},{attachment:{values:[]}},{textKey:"old.key"},{issuedAt:"2026-10-17T12:00:00.000001Z"},{expiresAt:intent.issuedAt}]){
      expect((await call("horizon_admin_inbox_send_ordinary",{...intent,...change})).isError).toBe(true);
    }
    expect(requests).toHaveLength(0);
  });
  it("returns the configured server rejection without truncation, a new revision or a hidden retry",async()=>{
    bytes=20;const saved=JSON.stringify(intent);const result=await call("horizon_admin_inbox_send_ordinary",intent);
    expect(result.isError).toBe(true);expect(JSON.stringify(result)).toContain("INVALID_REQUEST");expect(requests).toHaveLength(1);expect(requests[0].body.freeText).toBe(intent.freeText);expect(JSON.stringify(intent)).toBe(saved);expect(accepted).toBeNull();
  });
});
