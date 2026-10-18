import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";
const userId="550e8400-e29b-41d4-a716-446655440000", peer="650e8400-e29b-41d4-a716-446655440001", matchId="750e8400-e29b-41d4-a716-446655440002", projectApiKeyId="850e8400-e29b-41d4-a716-446655440003";
const session={userId,sessionToken:"fixture-player-session"}, project={projectApiKeyId};
const settings={name:"😀",capacity:2,visibility:"private",strength:9007199254740991,turnSeconds:60,timeoutPolicy:"forfeit",ranked:false,dataBase64:"AP8=",inviteeIds:[peer]};
const snapshot={match:{id:matchId,revision:9007199254740991,dataBase64:"",currentPlayerId:null,hasDisagreement:false,reports:[]},pollAfterSeconds:120,serverTime:"2026-10-16T00:00:00Z"};
let client:Client;let request:ReturnType<typeof vi.fn>;
beforeEach(async()=>{
 vi.stubEnv("HORIZON_API_KEY","fixture-app-key");vi.stubEnv("HORIZON_ACCOUNT_API_KEY","fixture-account-key");vi.stubEnv("HORIZON_BASE_URL","http://fixture.invalid");
 vi.spyOn(console,"error").mockImplementation(()=>{});request=vi.fn(async()=>new Response(JSON.stringify(snapshot)));vi.stubGlobal("fetch",request);
 client=new Client({name:"matches-test",version:"1"});const[a,b]=InMemoryTransport.createLinkedPair();await Promise.all([createServer().connect(b),client.connect(a)]);
});
afterEach(async()=>{await client?.close();vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
const call=(name:string,args:Record<string,unknown>)=>client.callTool({name:"horizon_"+name,arguments:args});
const calls=()=>request.mock.calls as unknown as [string,RequestInit][];
const body=(r:Awaited<ReturnType<typeof call>>)=>JSON.parse((r.content as {text:string}[])[0].text);
describe("matches through real MCP protocol transport",()=>{
 it("maps fourteen player routes with exact original revisions body and only player credentials",async()=>{
  expect(body(await call("get_matches",session))).toEqual(snapshot);
  await call("get_match_limits",session);await call("find_open_matches",{...session,minStrength:-1,maxStrength:9007199254740991,limit:1});
  await call("get_match",{...session,matchId});await call("create_match",{...session,expectedRevision:0,settings});
  for(const name of ["join_match","decline_match_invite","start_match","submit_match_turn","advance_match_timeout","leave_match","cancel_match"]){
   await call(name,{...session,matchId,expectedRevision:9007199254740991,...(name==="start_match"?{turnOrder:[userId,peer]}:{}),...(name==="submit_match_turn"?{dataBase64:"AP8=",finish:false}:{})});
  }
  await call("report_match_result",{...session,matchId,finalStateRevision:9007199254740991,resultBase64:"",winnerIds:[]});
  await call("start_match_ranked_run",{...session,matchId,finalStateRevision:9007199254740991});
  expect(calls().map(([url,o])=>[o.method,new URL(url).pathname])).toEqual([
   ["GET","/api/v1/app/matches"],["GET","/api/v1/app/matches/limits"],["GET","/api/v1/app/matches/open"],["GET",`/api/v1/app/matches/${matchId}`],["POST","/api/v1/app/matches"],
   ...["join","decline","start","turn","timeout","leave","cancel","result","ranked-run"].map(s=>["POST",`/api/v1/app/matches/${matchId}/${s}`])]);
  expect(JSON.parse(calls()[4][1].body as string)).toEqual({userId,...settings});expect(calls()[4][1].headers).toHaveProperty("If-Match","0");
  for(const[,o]of calls().slice(5,12))expect(o.headers).toHaveProperty("If-Match","9007199254740991");
  expect(JSON.parse(calls()[7][1].body as string)).toEqual({userId,turnOrder:[userId,peer]});
  expect(JSON.parse(calls()[8][1].body as string)).toEqual({userId,dataBase64:"AP8=",finish:false});
  expect(JSON.parse(calls()[12][1].body as string)).toEqual({userId,finalStateRevision:9007199254740991,resultBase64:"",winnerIds:[]});
  expect(JSON.parse(calls()[13][1].body as string)).toEqual({userId,finalStateRevision:9007199254740991});
  for(const[,o]of calls().slice(12))expect(o.headers).not.toHaveProperty("If-Match");
  for(const[url,o]of calls()){
   expect(o.headers).toMatchObject({"X-API-Key":"fixture-app-key",Authorization:"Bearer fixture-player-session"});
   expect(o.headers).not.toHaveProperty("X-Account-API-Key");expect(url).not.toContain(session.sessionToken);
  }
  expect(request).toHaveBeenCalledTimes(14);
 });
 it("rejects unsafe original revisions coercion invalid bytes self invites and invalid turn settings before HTTP",async()=>{
  for(const expectedRevision of [undefined,null,-1,1.5,"1",9007199254740992])expect((await call("join_match",{...session,matchId,expectedRevision})).isError).toBe(true);
  for(const change of [{name:" "},{name:"😀".repeat(31)},{name:"\ud800"},{capacity:9},{capacity:"2"},{strength:9007199254740992},
   {turnSeconds:59},{turnSeconds:604801},{ranked:"false"},{inviteeIds:[userId]},{inviteeIds:[peer,peer]},{dataBase64:"AB=="},{dataBase64:"AP8=\n"},
   {dataBase64:Buffer.alloc(14999553).toString("base64")},{extra:true}])expect((await call("create_match",{...session,expectedRevision:0,settings:{...settings,...change}})).isError).toBe(true);
  for(const turnOrder of [[userId],[userId,userId]])expect((await call("start_match",{...session,matchId,expectedRevision:1,turnOrder})).isError).toBe(true);
  expect((await call("submit_match_turn",{...session,matchId,expectedRevision:1,dataBase64:"",finish:"false"})).isError).toBe(true);
  for(const winnerIds of [[peer,userId],[userId,userId]])expect((await call("report_match_result",{...session,matchId,finalStateRevision:1,resultBase64:"",winnerIds})).isError).toBe(true);
  expect((await call("report_match_result",{...session,matchId,finalStateRevision:1,resultBase64:Buffer.alloc(257).toString("base64"),winnerIds:[]})).isError).toBe(true);
  expect(request).not.toHaveBeenCalled();
 });
 it("makes one request on lost responses conflict throttle failure or explicit unsupported ranked mode",async()=>{
  request.mockImplementationOnce(async()=>{throw new Error("lost commit response")});
  expect((await call("create_match",{...session,expectedRevision:0,settings})).isError).toBe(true);
  for(const[status,code]of [[409,"STATE_CONFLICT"],[409,"REVISION_CONFLICT"],[429,"RATE_LIMIT_EXCEEDED"],[503,"TEMPORARILY_UNAVAILABLE"]]as const){
   request.mockImplementationOnce(async()=>new Response(JSON.stringify({code}),{status}));
   const result=await call("submit_match_turn",{...session,matchId,expectedRevision:7,dataBase64:"",finish:true});
   expect(result.isError).toBe(true);expect((result.content as {text:string}[])[0].text).toContain(code);
  }
  request.mockImplementationOnce(async()=>new Response(JSON.stringify({code:"FEATURE_NOT_SUPPORTED"}),{status:501}));
  expect((await call("start_match_ranked_run",{...session,matchId,finalStateRevision:7})).isError).toBe(true);
  expect(request).toHaveBeenCalledTimes(6);for(const[,o]of calls().slice(1,5))expect(o.headers).toHaveProperty("If-Match","7");
 });
 it("preserves empty consumed pages null byte visibility and original ranked recovery without speculative calls",async()=>{
  const cursor=Buffer.from("original opaque cursor").toString("base64"),empty={matches:[],nextCursor:cursor,pollAfterSeconds:240};
  request.mockImplementationOnce(async()=>new Response(JSON.stringify(empty)));
  expect(body(await call("find_open_matches",{...session,minStrength:0,maxStrength:1}))).toEqual(empty);
  await call("find_open_matches",{...session,minStrength:0,maxStrength:1,cursor});expect(new URL(calls()[1][0]).searchParams.get("cursor")).toBe(cursor);
  request.mockImplementationOnce(async()=>new Response(JSON.stringify({...snapshot,match:{...snapshot.match,dataBase64:null}})));
  expect(body(await call("get_match",{...session,matchId})).match.dataBase64).toBeNull();
  const run={runId:matchId,seed:4294967296,expiresAt:"2026-10-16T00:01:00Z",ticket:"fixture-ticket",expiresInSeconds:50};
  request.mockImplementation(async()=>new Response(JSON.stringify(run)));
  for(let i=0;i<2;i++)expect(body(await call("start_match_ranked_run",{...session,matchId,finalStateRevision:9}))).toEqual(run);
  expect(calls()[3][1].body).toBe(calls()[4][1].body);expect(request).toHaveBeenCalledTimes(5);
  for(const query of [{minStrength:2,maxStrength:1},{minStrength:0,maxStrength:1,limit:51},{minStrength:0,maxStrength:1,cursor:"bad!"}])
   expect((await call("find_open_matches",{...session,...query})).isError).toBe(true);
  expect(request).toHaveBeenCalledTimes(5);
 });
 it("maps seven scoped admin routes and preserves config-null original CAS and absent request bodies",async()=>{
  await call("admin_match_config_get",project);await call("admin_match_config_set",{...project,expectedRevision:0,rankedLeaderboardKey:null});
  await call("admin_match_limits",project);await call("admin_matches_list",{...project,status:"unconfirmed",limit:10});
  await call("admin_match_get",{...project,matchId});await call("admin_match_cancel",{...project,matchId,expectedRevision:7});await call("admin_matches_cleanup",project);
  expect(calls().map(([url,o])=>[o.method,new URL(url).pathname])).toEqual([
   ["GET","/api/v1/admin/matches/config"],["PUT","/api/v1/admin/matches/config"],["GET","/api/v1/admin/matches/limits"],["GET","/api/v1/admin/matches"],
   ["GET",`/api/v1/admin/matches/${matchId}`],["POST",`/api/v1/admin/matches/${matchId}/cancel`],["POST","/api/v1/admin/matches/cleanup"]]);
  expect(JSON.parse(calls()[1][1].body as string)).toEqual({rankedLeaderboardKey:null});expect(calls()[1][1].headers).toHaveProperty("If-Match","0");
  expect(calls()[5][1].body).toBeUndefined();expect(calls()[5][1].headers).toHaveProperty("If-Match","7");expect(calls()[6][1].body).toBeUndefined();
  for(const[url,o]of calls()){
   expect(new URL(url).searchParams.get("apiKeyId")).toBe(projectApiKeyId);expect(o.headers).toHaveProperty("X-Account-API-Key","fixture-account-key");
   expect(o.headers).not.toHaveProperty("Authorization");expect(o.headers).not.toHaveProperty("X-API-Key");
  }
  expect(request).toHaveBeenCalledTimes(7);
 });
 it("does not manufacture admin scope or issue requests for invalid configuration or absent credentials",async()=>{
  for(const rankedLeaderboardKey of ["","bad/key","a\n",123])expect((await call("admin_match_config_set",{...project,expectedRevision:0,rankedLeaderboardKey})).isError).toBe(true);
  expect((await call("admin_matches_list",{...project,status:"winner"})).isError).toBe(true);
  vi.stubEnv("HORIZON_ACCOUNT_API_KEY","");expect((await call("admin_match_get",{...project,matchId})).isError).toBe(true);
  vi.stubEnv("HORIZON_API_KEY","");expect((await call("get_matches",session)).isError).toBe(true);expect(request).not.toHaveBeenCalled();
 });
 it("discovers all21 tools their real effects and both engine documentation prompts",async()=>{
  const{tools}=await client.listTools();const matches=tools.filter(t=>/^horizon_(admin_)?(.*_)?match(?:es)?(_|$)/.test(t.name));
  expect(matches).toHaveLength(21);expect(tools.find(t=>t.name==="horizon_find_open_matches")?.annotations).toMatchObject({readOnlyHint:true});
  expect(tools.find(t=>t.name==="horizon_submit_match_turn")?.annotations).toMatchObject({readOnlyHint:false,destructiveHint:true,idempotentHint:true});
  expect(tools.find(t=>t.name==="horizon_admin_matches_cleanup")?.annotations).toMatchObject({readOnlyHint:false,idempotentHint:false});
  expect((await client.readResource({uri:"horizon://docs/matches"})).contents[0]).toMatchObject({text:expect.stringContaining("original player-ledger revision")});
  for(const engine of ["unity","godot","unreal"])for(const name of ["integrate-feature","explain-feature"])
   expect((await client.getPrompt({name,arguments:{feature:"matches",engine}})).messages[0].content).toMatchObject({text:expect.stringContaining("horizon://docs/matches")});
  expect(request).not.toHaveBeenCalled();
 });
});
