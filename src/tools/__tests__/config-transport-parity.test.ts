import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer as createHttpServer, type Server, type IncomingHttpHeaders } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";
import { BSON_DOCUMENT_BYTES, GROUP_WRITE_FRAME_BYTES, MATCH_STATE_BYTES, SHARED_OBJECT_BYTES } from "../feature-bounds.js";

const userId="550e8400-e29b-41d4-a716-446655440000", peer="650e8400-e29b-41d4-a716-446655440001";
const projectApiKeyId="750e8400-e29b-41d4-a716-446655440002", objectId="850e8400-e29b-41d4-a716-446655440003";
const session={userId,sessionToken:"fixture-current-session"}, project={projectApiKeyId};
type Observed={url:URL;method:string;body:Record<string,any>;bytes:number;headers:IncomingHttpHeaders};
let server:Server,client:Client,requests:Observed[],reply:(request:Observed)=>unknown;
beforeEach(async()=>{
 requests=[];reply=()=>({ok:true});
 server=createHttpServer(async(req,res)=>{
  try {
   const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
   const raw=Buffer.concat(chunks);const observed={url:new URL(req.url!,"http://fixture.invalid"),method:req.method!,body:raw.length?JSON.parse(raw.toString()):{},bytes:raw.length,headers:req.headers};
   requests.push(observed);res.setHeader("Content-Type","application/json");res.end(JSON.stringify(reply(observed)));
  }catch{res.statusCode=500;res.end('{"code":"FIXTURE_ASSERTION"}');}
 });
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 const address=server.address();if(!address||typeof address==="string")throw Error("Missing fixture port");
 vi.stubEnv("HORIZON_API_KEY","fixture-project-key");vi.stubEnv("HORIZON_ACCOUNT_API_KEY","fixture-account-key");
 vi.stubEnv("HORIZON_BASE_URL","http://127.0.0.1:"+address.port);vi.spyOn(console,"error").mockImplementation(()=>{});
 client=new Client({name:"config-parity-native-http",version:"1"});const[a,b]=InMemoryTransport.createLinkedPair();
 await Promise.all([createServer().connect(b),client.connect(a)]);
});
afterEach(async()=>{await client?.close();server?.closeAllConnections();await new Promise<void>(resolve=>server?.close(()=>resolve()));vi.unstubAllEnvs();vi.restoreAllMocks();});
const call=(name:string,args:Record<string,unknown>)=>client.callTool({name:"horizon_"+name,arguments:args});
const value=(result:Awaited<ReturnType<typeof call>>)=>{expect(result.isError).not.toBe(true);return result.structuredContent??JSON.parse((result.content as {text:string}[])[0].text);};

describe("configured policies over real MCP and loopback HTTP",()=>{
 it("sends exact1MiB Shared bytes and Int32 owner policy, rejects frame+1, retains large reads after lowering",async()=>{
  const dataBase64=Buffer.alloc(SHARED_OBJECT_BYTES,0xa5).toString("base64");
  const definition={name:"Configured",active:true,readPolicy:"owner",writePolicy:"owner",maxObjectBytes:SHARED_OBJECT_BYTES,maxObjectsPerOwner:2147483647,ttlSeconds:null,searchFields:[],positionEnabled:false};
  const object={id:objectId,ownerId:userId,revision:7,dataBase64,search:{},position:null};
  reply=r=>r.url.pathname.endsWith("/collections/world")?{revision:1,definition}:{object,usage:{count:101,limits:{objectBytes:1}}};
  value(await call("admin_shared_collection_set",{...project,collection:"world",expectedRevision:0,definition}));
  const written=value(await call("create_shared_object",{...session,collection:"world",expectedRevision:6,dataBase64,search:{},position:null}));
  expect(written.object.dataBase64).toBe(dataBase64);expect(requests).toHaveLength(2);
  expect(requests[0].body).toEqual(definition);expect(requests[1].body.dataBase64).toBe(dataBase64);
  expect(requests[1].bytes).toBeLessThanOrEqual(1402200);expect(requests[1].headers.authorization).toBe("Bearer fixture-current-session");
  expect(requests[1].headers["if-match"]).toBe("6");
  expect((await call("create_shared_object",{...session,collection:"world",expectedRevision:6,dataBase64:Buffer.alloc(SHARED_OBJECT_BYTES+1).toString("base64"),search:{}})).isError).toBe(true);
  expect(requests).toHaveLength(2);
  expect(value(await call("get_shared_object",{...session,collection:"world",objectId})).object).toEqual(object);
  expect(requests).toHaveLength(3);expect(requests[2].method).toBe("GET");
 });
 it("transports the actual maximum Match frame unchanged and preserves a larger retained snapshot with zero detail policy",async()=>{
  const dataBase64=Buffer.alloc(MATCH_STATE_BYTES,0x7f).toString("base64");
  const settings={name:"Retained",capacity:2,visibility:"private",strength:1,turnSeconds:60,timeoutPolicy:"skip",ranked:false,dataBase64,inviteeIds:[peer]};
  reply=r=>r.method==="GET"?{userId,revision:9,active:Array.from({length:201},(_,i)=>({id:String(i)})),recent:[],pendingResults:[{matchId:objectId,finalStateRevision:4,ownRankedRunId:null,expiresAt:"2026-10-18T01:00:00Z"}],limits:{activeMatches:1,stateBytes:1,retainedMatches:0,historyRetentionSeconds:0}}:{match:{id:objectId,revision:4,dataBase64}};
  expect(value(await call("create_match",{...session,expectedRevision:0,settings})).match.dataBase64).toBe(dataBase64);
  expect(requests[0].body).toEqual({userId,...settings});expect(requests[0].bytes).toBeLessThanOrEqual(20003500);
  expect(requests[0].headers["if-match"]).toBe("0");
  expect(value(await call("submit_match_turn",{...session,matchId:objectId,expectedRevision:4,dataBase64,finish:true})).match.dataBase64).toBe(dataBase64);
  expect(requests[1].body).toEqual({userId,dataBase64,finish:true});expect(requests[1].headers["if-match"]).toBe("4");
  expect((await call("submit_match_turn",{...session,matchId:objectId,expectedRevision:4,dataBase64:Buffer.alloc(MATCH_STATE_BYTES+1).toString("base64"),finish:true})).isError).toBe(true);
  expect(requests).toHaveLength(2);
  const retained=value(await call("get_matches",session));expect(retained.active).toHaveLength(201);expect(retained.pendingResults[0].finalStateRevision).toBe(4);expect(retained.limits.retainedMatches).toBe(0);
  expect(requests).toHaveLength(3);
 },30000);
 it("accepts configured Group strings/data/depth and pages257, defaults safely to1, and keeps257 retained memberships",async()=>{
  let deep:unknown=1;for(let i=0;i<32;i++)deep={x:deep};
  const metadata={name:"ü".repeat(121),description:"x"+"\u0000".repeat(2*1024*1024),joinMode:"invite",data:{deep,payload:"α".repeat(4096),"a.b":1,a_b:2}};
  const group={id:objectId,revision:8,...metadata,createdAt:null,updatedAt:null};let cap=257;
  reply=r=>{if(r.url.pathname.endsWith("/members")||r.url.pathname==="/api/v1/admin/groups"){expect(Number(r.url.searchParams.get("limit"))).toBeLessThanOrEqual(cap);return {revision:8,members:[{userId,joinedAt:null}],nextAfterUserId:null};}
   expect(r.method).toBe("POST");return {groups:{groups:[group]},group};};
  const changed=value(await call("create_group",{...session,...metadata,expectedPlayerRevision:7}));expect(changed.group.data).toEqual(metadata.data);
  expect(requests[0].body).toEqual({userId,...metadata,expectedPlayerRevision:7});expect(requests[0].bytes).toBeGreaterThan(12*1024*1024);expect(requests[0].bytes).toBeLessThan(100663296);
  // Keep the retained aggregate representative without allocating257 copies of the2MiB fixture.
  reply=r=>{if(r.url.pathname.endsWith("/members")||r.url.pathname==="/api/v1/admin/groups"){expect(Number(r.url.searchParams.get("limit"))).toBeLessThanOrEqual(cap);return {revision:8,members:[{userId,joinedAt:null}],nextAfterUserId:null};}
   return {userId,revision:9,groups:Array.from({length:257},(_,i)=>({id:String(i),name:"retained",createdAt:null})),limits:{maxGroupsPerPlayer:1,memberPageSize:cap}};};
  value(await call("get_group_members",{...session,groupId:objectId,limit:257}));expect(requests[1].url.searchParams.get("limit")).toBe("257");
  value(await call("admin_groups_list",{...project,limit:257}));cap=1;
  value(await call("get_group_members",{...session,groupId:objectId}));value(await call("admin_groups_list",project));
  expect(requests.slice(3,5).map(r=>r.url.searchParams.get("limit"))).toEqual(["1","1"]);
  expect(value(await call("get_groups",session)).groups).toHaveLength(257);expect(requests).toHaveLength(6);
  expect((await call("create_group",{...session,name:"x",description:"",joinMode:"open",data:{x:Infinity},expectedPlayerRevision:7})).isError).toBe(true);expect(requests).toHaveLength(6);
 },30000);
 it("forwards one unchanged numeric Group array whose client JSON exceeds the server storage envelope",async()=>{
  // Actual Jackson2.19.2 read/write proof:0.000001 becomes1.0E-6. With2M values,
  // client JSON is18,000,012 bytes; server dataJson is14,000,012 before BSON metadata.
  const count=2_000_000,data={values:Array<number>(count).fill(0.000001)};
  const clientBytes=Buffer.byteLength(JSON.stringify(data));expect(clientBytes).toBe(18_000_012);
  expect(clientBytes).toBeGreaterThan(BSON_DOCUMENT_BYTES);
  expect(Buffer.byteLength('{"values":[]}')+count*"1.0E-6".length+count-1).toBe(14_000_012);
  const fields={userId,name:"Numeric data",description:"",joinMode:"invite",data,expectedPlayerRevision:7};
  const original=JSON.stringify(fields);expect(Buffer.byteLength(original)).toBeLessThan(GROUP_WRITE_FRAME_BYTES);
  reply=()=>({groups:{revision:8},group:{id:objectId,revision:1}});
  value(await call("create_group",{...fields,sessionToken:session.sessionToken}));
  expect(requests).toHaveLength(1);expect(requests[0].method).toBe("POST");
  expect(requests[0].body.expectedPlayerRevision).toBe(7);
  expect(requests[0].body.data.values).toHaveLength(count);
  expect(requests[0].body.data.values.every((v:number)=>v===0.000001)).toBe(true);
  expect(requests[0].bytes).toBe(Buffer.byteLength(original));expect(JSON.stringify(requests[0].body)).toBe(original);
 },30000);
 it("accepts256 PV identities,1001 offers and correction keys, with current empty-delta replay untouched",async()=>{
  const definitions=Array.from({length:256},(_,i)=>({key:"v"+i,name:"Value"+i,initialBalance:0,maxBalance:10000}));
  const offers=Array.from({length:1001},(_,i)=>({key:"o"+i,name:"Offer"+i,active:true,costs:[{key:"v0",amount:1}],rewards:[{key:"v1",amount:1}],purchasesPerDay:null}));
  reply=r=>({revision:8,definitions,offers,limits:{definitions:1,offers:1,receipts:1},operation:{operationId:r.body.operationId,replayed:true,alreadyApplied:true,applied:[],items:[]}});
  value(await call("admin_player_values_config_set",{...project,expectedRevision:7,definitions,offers}));expect(requests[0].body.definitions).toHaveLength(256);expect(requests[0].body.offers).toHaveLength(1001);
  const original={...project,userId,values:definitions.map(d=>({key:d.key,balance:1})),note:"original note",operationId:"1792281600000:"+objectId};
  const corrected=value(await call("admin_player_values_player_correct",original));expect(corrected.operation).toMatchObject({replayed:true,alreadyApplied:true,applied:[],items:[]});expect(requests[1].body.values).toHaveLength(256);expect(requests[1].body.note).toBe("original note");
  expect(value(await call("admin_player_values_config_get",project)).offers).toHaveLength(1001);
  expect((await call("admin_player_values_config_set",{...project,expectedRevision:7,definitions:[...definitions,{key:"extra",name:"Extra"}],offers})).isError).toBe(true);
  expect((await call("admin_player_values_config_set",{...project,expectedRevision:7,definitions,offers:[{...offers[0],purchasesPerDay:1}]})).isError).toBe(true);expect(requests).toHaveLength(3);
 });
 it("sends501 Achievement definitions and preserves completion-only instant unlock/replay responses",async()=>{
  const definitions=Array.from({length:501},(_,i)=>({key:"a"+i,name:"Achievement"+i,description:"",mode:"manual",active:true,hidden:false,rewards:{values:[]}}));
  const compact={userId,revision:9,progress:definitions.map(d=>({key:d.key,unlockedAt:null,rewardState:"complete",pendingReward:null,inboxEntryId:null})),limits:{maxDefinitions:1,maxLifetimeKeys:1}};
  reply=r=>r.method==="PUT"?{revision:8,definitions,limits:{maxDefinitions:1000,maxLifetimeKeys:1000}}:r.url.pathname.endsWith("/unlock")?{achievements:compact,newlyUnlocked:[],replayed:true,deliveryResults:[]}:{...compact,results:[{key:"a0",state:"complete",inboxEntryId:null}]};
  expect(value(await call("admin_achievements_definitions_set",{...project,expectedRevision:7,definitions})).definitions).toHaveLength(501);expect(requests[0].body.definitions).toHaveLength(501);
  const unlocked=value(await call("unlock_achievement",{...session,key:"a0"}));expect(unlocked.deliveryResults).toEqual([]);expect(unlocked.achievements.progress).toHaveLength(501);
  value(await call("deliver_achievement_rewards",{...session,keys:["a0"]}));expect(requests).toHaveLength(3);
  const tools=await client.listTools();expect(tools.tools.find(t=>t.name==="horizon_unlock_achievement")?.description).toContain("immediately");
  expect(tools.tools.find(t=>t.name==="horizon_deliver_achievement_rewards")?.annotations?.readOnlyHint).toBe(true);
 });
});
