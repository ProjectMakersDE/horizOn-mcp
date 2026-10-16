import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";
const userId="550e8400-e29b-41d4-a716-446655440000", peerId="650e8400-e29b-41d4-a716-446655440001", channelId="750e8400-e29b-41d4-a716-446655440002";
const projectApiKeyId="850e8400-e29b-41d4-a716-446655440003", operationId="950e8400-e29b-41d4-a716-446655440004", messageId="a50e8400-e29b-41d4-a716-446655440005", reportId="b50e8400-e29b-41d4-a716-446655440006";
const session={userId,sessionToken:"fixture-player-session"},project={projectApiKeyId},issuedAt="2026-10-16T01:02:03.004Z";
const original={...session,channelId,operationId,issuedAt,text:"😀\n<&>\toriginal"};
const snapshot={channel:{id:channelId,epoch:operationId,revision:9007199254740991},visibleMessageIds:[messageId],messages:[{id:messageId,text:original.text}],serverTime:issuedAt};
let client:Client;let request:ReturnType<typeof vi.fn>;
beforeEach(async()=>{
 vi.stubEnv("HORIZON_API_KEY","fixture-app-key");vi.stubEnv("HORIZON_ACCOUNT_API_KEY","fixture-account-key");vi.stubEnv("HORIZON_BASE_URL","http://fixture.invalid");
 vi.spyOn(console,"error").mockImplementation(()=>{});request=vi.fn(async()=>new Response(JSON.stringify(snapshot)));vi.stubGlobal("fetch",request);
 client=new Client({name:"chat-test",version:"1"});const[a,b]=InMemoryTransport.createLinkedPair();await Promise.all([createServer().connect(b),client.connect(a)]);
});
afterEach(async()=>{await client?.close();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
const call=(name:string,args:Record<string,unknown>)=>client.callTool({name:"horizon_"+name,arguments:args});
const calls=()=>request.mock.calls as unknown as [string,RequestInit][];
const body=(r:Awaited<ReturnType<typeof call>>)=>JSON.parse((r.content as {text:string}[])[0].text);
describe("chat through real MCP protocol transport",()=>{
 it("maps six player routes with only current player credentials and exact original Unicode bytes",async()=>{
  expect(body(await call("get_chat_limits",session))).toEqual(snapshot);
  await call("open_chat_channel",{...session,kind:"direct",peerId});
  await call("sync_chat_channel",{...session,channelId,epoch:null,knownMessageIds:[]});
  await call("send_chat_message",original);await call("get_chat_operation",{...session,operationId});
  await call("report_chat_message",{...session,channelId,messageId,reason:"Original reason😀"});
  expect(calls().map(([url,o])=>[o.method,new URL(url).pathname])).toEqual([
   ["GET","/api/v1/app/chat/limits"],["POST","/api/v1/app/chat/channels/open"],["POST",`/api/v1/app/chat/channels/${channelId}/sync`],
   ["POST",`/api/v1/app/chat/channels/${channelId}/messages`],["GET",`/api/v1/app/chat/operations/${operationId}`],["POST",`/api/v1/app/chat/channels/${channelId}/messages/${messageId}/report`]]);
  expect(JSON.parse(calls()[1][1].body as string)).toEqual({userId,kind:"direct",peerId});
  expect(JSON.parse(calls()[2][1].body as string)).toEqual({userId,epoch:null,knownMessageIds:[]});
  expect(JSON.parse(calls()[3][1].body as string)).toEqual({userId,operationId,issuedAt,text:original.text});
  expect(JSON.parse(calls()[5][1].body as string)).toEqual({userId,reason:"Original reason😀"});
  for(const[url,o]of calls()){
   expect(o.headers).toMatchObject({"X-API-Key":"fixture-app-key",Authorization:"Bearer fixture-player-session"});
   expect(o.headers).not.toHaveProperty("X-Account-API-Key");expect(o.headers).not.toHaveProperty("If-Match");expect(url).not.toContain(session.sessionToken);
  }
  for(const index of [0,4])expect(new URL(calls()[index][0]).searchParams.get("userId")).toBe(userId);
  expect(request).toHaveBeenCalledTimes(6);
 });
 it("rejects malformed Unicode timestamps IDs channel combinations and incomplete cache identity before HTTP",async()=>{
  for(const text of [" ","\ud800","\u0000","\u007f","\u009f","a".repeat(501),"😀".repeat(501)])expect((await call("send_chat_message",{...original,text})).isError).toBe(true);
  for(const issuedAt of ["2026-10-16T01:02:03Z","2026-02-30T01:02:03.004Z","2026-10-16T01:02:03.004+00:00",42])
   expect((await call("send_chat_message",{...original,issuedAt})).isError).toBe(true);
  for(const operationId of [operationIdUpper(),"9-0-0-0-1",null])expect((await call("send_chat_message",{...original,operationId})).isError).toBe(true);
  for(const settings of [{kind:"direct"},{kind:"direct",peerId:userId},{kind:"direct",peerId,groupId:channelId},{kind:"project",peerId},{kind:"group"},{kind:"group",groupId:channelId,peerId}])
   expect((await call("open_chat_channel",{...session,...settings})).isError).toBe(true);
  for(const changes of [{epoch:undefined},{knownMessageIds:[messageId,messageId]},{knownMessageIds:Array(101).fill(messageId)}])
   expect((await call("sync_chat_channel",{...session,channelId,epoch:null,knownMessageIds:[],...changes})).isError).toBe(true);
  expect((await call("report_chat_message",{...session,channelId,messageId,reason:"a".repeat(241)})).isError).toBe(true);
  expect(request).not.toHaveBeenCalled();
 });
 it("preserves full incremental cache IDs and the maximum valid Unicode text without automatic polling",async()=>{
  const ids=Array.from({length:100},(_,i)=>`00000000-0000-0000-0000-${i.toString(16).padStart(12,"0")}`);
  const incremental={...snapshot,visibleMessageIds:ids,messages:[]};request.mockImplementationOnce(async()=>new Response(JSON.stringify(incremental)));
  expect(body(await call("sync_chat_channel",{...session,channelId,epoch:operationId,knownMessageIds:ids}))).toEqual(incremental);
  expect(JSON.parse(calls()[0][1].body as string)).toEqual({userId,epoch:operationId,knownMessageIds:ids});
  await call("send_chat_message",{...original,text:"😀".repeat(500)});expect(JSON.parse(calls()[1][1].body as string).text).toBe("😀".repeat(500));
  await call("open_chat_channel",{...session,kind:"group",groupId:channelId});await call("open_chat_channel",{...session,kind:"project"});
  expect(JSON.parse(calls()[3][1].body as string)).toEqual({userId,kind:"project"});expect(request).toHaveBeenCalledTimes(4);
 });
 it("makes one attempt and keeps original intent on lost response conflict throttle unsupported and host changes",async()=>{
  request.mockImplementationOnce(async()=>{throw new Error("lost committed response")});expect((await call("send_chat_message",original)).isError).toBe(true);
  for(const[status,code]of [[409,"OPERATION_CONFLICT"],[409,"OPERATION_EXPIRED"],[429,"RATE_LIMIT_EXCEEDED"],[503,"TEMPORARILY_UNAVAILABLE"],[501,"NOT_SUPPORTED"]]as const){
   request.mockImplementationOnce(async()=>new Response(JSON.stringify({code}),{status}));
   const result=await call("send_chat_message",original);expect(result.isError).toBe(true);expect((result.content as {text:string}[])[0].text).toContain(code);
  }
  vi.stubEnv("HORIZON_BASE_URL","http://changed.invalid");const receipt={receipt:{operationId,messageId,channelId,issuedAt},serverTime:issuedAt};
  request.mockImplementationOnce(async()=>new Response(JSON.stringify(receipt)));expect(body(await call("get_chat_operation",{...session,operationId}))).toEqual(receipt);
  await call("send_chat_message",original);expect(new URL(calls()[7][0]).hostname).toBe("changed.invalid");
  for(const index of [1,2,3,4,5,7])expect(calls()[index][1].body).toBe(calls()[0][1].body);
  const removed={reportId,status:"removed",replayed:true,serverTime:issuedAt};request.mockImplementationOnce(async()=>new Response(JSON.stringify(removed)));
  expect(body(await call("report_chat_message",{...session,channelId,messageId,reason:"original"}))).toEqual(removed);expect(request).toHaveBeenCalledTimes(9);
 });
 it("maps all twelve scoped admin routes preserving CAS null clears exact pages and empty cleanup body",async()=>{
  await call("admin_chat_config_get",project);await call("admin_chat_limits_get",project);
  await call("admin_chat_config_set",{...project,expectedRevision:0,blockedTerms:[]});await call("admin_chat_channels_list",{...project,after:channelId,limit:1});
  await call("admin_chat_channel_get",{...project,channelId});await call("admin_chat_message_delete",{...project,channelId,messageId,expectedRevision:9007199254740991});
  const cursor=Buffer.from("original opaque cursor").toString("base64url"),empty={reports:[],nextCursor:cursor,serverTime:issuedAt};request.mockImplementationOnce(async()=>new Response(JSON.stringify(empty)));
  expect(body(await call("admin_chat_reports_list",{...project,status:"open",cursor,limit:2}))).toEqual(empty);
  await call("admin_chat_report_resolve",{...project,reportId,expectedRevision:7,status:"dismissed"});await call("admin_chat_report_delete",{...project,reportId,expectedRevision:8});
  await call("admin_chat_moderation_get",{...project,userId});await call("admin_chat_moderation_set",{...project,userId,expectedRevision:0,muteUntil:null,banUntil:null,reason:""});
  await call("admin_chat_cleanup",project);
  const base=`/api/v1/admin/features/chat/${projectApiKeyId}`;
  expect(calls().map(([url,o])=>[o.method,new URL(url).pathname])).toEqual([
   ["GET",base+"/config"],["GET",base+"/limits"],["PUT",base+"/config"],["GET",base+"/channels"],["GET",base+`/channels/${channelId}`],
   ["DELETE",base+`/channels/${channelId}/messages/${messageId}`],["GET",base+"/reports"],["POST",base+`/reports/${reportId}/resolve`],
   ["DELETE",base+`/reports/${reportId}`],["GET",base+`/players/${userId}/moderation`],["PUT",base+`/players/${userId}/moderation`],["POST",base+"/cleanup"]]);
  for(const[index,revision]of [[2,"0"],[5,"9007199254740991"],[7,"7"],[8,"8"],[10,"0"]]as const)expect(calls()[index][1].headers).toHaveProperty("If-Match",revision);
  expect(JSON.parse(calls()[2][1].body as string)).toEqual({blockedTerms:[]});expect(JSON.parse(calls()[7][1].body as string)).toEqual({status:"dismissed"});
  expect(JSON.parse(calls()[10][1].body as string)).toEqual({muteUntil:null,banUntil:null,reason:""});expect(calls()[11][1].body).toBe("{}");
  for(const index of [5,8])expect(calls()[index][1].body).toBeUndefined();
  expect(new URL(calls()[3][0]).searchParams.get("after")).toBe(channelId);expect(new URL(calls()[6][0]).searchParams.get("cursor")).toBe(cursor);
  for(const[url,o]of calls()){
   expect(o.headers).toHaveProperty("X-Account-API-Key","fixture-account-key");expect(o.headers).not.toHaveProperty("X-API-Key");expect(o.headers).not.toHaveProperty("Authorization");
   expect(new URL(url).searchParams.has("apiKeyId")).toBe(false);
  }
  expect(request).toHaveBeenCalledTimes(12);
 });
 it("rejects unsafe moderation and never manufactures credentials or scope",async()=>{
  for(const expectedRevision of [undefined,null,-1,1.5,"1",9007199254740992])expect((await call("admin_chat_message_delete",{...project,channelId,messageId,expectedRevision})).isError).toBe(true);
  for(const blockedTerms of [[""],["\u0000"],["Ａ","a"],["x".repeat(65)],Array(101).fill("x")])
   expect((await call("admin_chat_config_set",{...project,expectedRevision:0,blockedTerms})).isError).toBe(true);
  for(const changes of [{muteUntil:undefined},{banUntil:"2026-10-17T00:00:00Z"},{reason:"\udfff"}])
   expect((await call("admin_chat_moderation_set",{...project,userId,expectedRevision:0,muteUntil:null,banUntil:null,reason:"",...changes})).isError).toBe(true);
  for(const changes of [{status:"closed"},{cursor:"bad!"},{limit:51}])expect((await call("admin_chat_reports_list",{...project,...changes})).isError).toBe(true);
  expect((await call("admin_chat_report_resolve",{...project,reportId,expectedRevision:0,status:"open"})).isError).toBe(true);
  vi.stubEnv("HORIZON_ACCOUNT_API_KEY","");expect((await call("admin_chat_config_get",project)).isError).toBe(true);
  vi.stubEnv("HORIZON_API_KEY","");expect((await call("get_chat_limits",session)).isError).toBe(true);expect(request).not.toHaveBeenCalled();
 });
 it("discovers eighteen tools with real effects and hosted-only recovery/cache documentation",async()=>{
  const{tools}=await client.listTools();expect(tools.filter(t=>t.name.includes("_chat_")).length).toBe(18);
  expect(tools.find(t=>t.name==="horizon_sync_chat_channel")?.annotations).toMatchObject({readOnlyHint:true});
  expect(tools.find(t=>t.name==="horizon_send_chat_message")?.annotations).toMatchObject({readOnlyHint:false,destructiveHint:true,idempotentHint:true});
  expect(tools.find(t=>t.name==="horizon_admin_chat_cleanup")?.annotations).toMatchObject({readOnlyHint:false,destructiveHint:true,idempotentHint:false});
  const resource=(await client.readResource({uri:"horizon://docs/chat"})).contents[0];expect(resource).toMatchObject({text:expect.stringContaining("NOT_SUPPORTED")});
  for(const engine of ["unity","godot","unreal"])for(const name of ["integrate-feature","explain-feature"])
   expect((await client.getPrompt({name,arguments:{feature:"chat",engine}})).messages[0].content).toMatchObject({text:expect.stringContaining("horizon://docs/chat")});
  expect(request).not.toHaveBeenCalled();
 });
});
function operationIdUpper(){return operationId.toUpperCase();}
