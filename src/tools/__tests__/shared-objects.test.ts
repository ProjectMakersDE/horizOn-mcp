import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";

const userId = "550e8400-e29b-41d4-a716-446655440000", objectId = "650e8400-e29b-41d4-a716-446655440001", projectApiKeyId = "750e8400-e29b-41d4-a716-446655440002";
const session = { userId, sessionToken: "fixture-player-session" }, project = { projectApiKeyId }, collection = "map";
const data = { dataBase64: "AP8BAg==", search: { power: 9007199254740991, label: "😀" }, position: { x: -1, y: 2 } };
const snapshot = { object: { id: objectId, ownerId: userId, revision: 7, ...data }, pollAfterSeconds: 120, serverTime: "2026-10-16T00:00:00Z" };
const definition = { name: "Map", active: true, readPolicy: "all", writePolicy: "owner", maxObjectBytes: 2048, maxObjectsPerOwner: 1, ttlSeconds: null,
  searchFields: [{ key: "power", type: "integer" }, { key: "label", type: "string" }], positionEnabled: true };
let client: Client; let request: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.stubEnv("HORIZON_API_KEY", "fixture-app-key"); vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "fixture-account-key"); vi.stubEnv("HORIZON_BASE_URL", "http://fixture.invalid");
  vi.spyOn(console, "error").mockImplementation(() => {});
  request = vi.fn(async () => new Response(JSON.stringify(snapshot))); vi.stubGlobal("fetch", request);
  client = new Client({ name: "shared-test", version: "1" }); const [a,b] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer().connect(b), client.connect(a)]);
});
afterEach(async () => { await client?.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const call = (name: string, args: Record<string, unknown>) => client.callTool({ name: "horizon_" + name, arguments: args });
const calls = () => request.mock.calls as unknown as [string, RequestInit][];
const body = (result: Awaited<ReturnType<typeof call>>) => JSON.parse((result.content as {text:string}[])[0].text);

describe("shared objects through real MCP transport", () => {
  it("maps all seven player routes with only player headers and exact opaque bytes", async () => {
    expect(body(await call("get_shared_collections", { ...session, afterKey: "a", limit: 2, catalogRevision: 0 }))).toEqual(snapshot);
    await call("get_shared_usage", { ...session, collection });
    await call("get_shared_object", { ...session, collection, objectId });
    const query = { mode: "field", field: "power", min: 1, max: 9, limit: 2 };
    await call("query_shared_objects", { ...session, collection, query });
    await call("create_shared_object", { ...session, collection, expectedRevision: 0, ...data });
    await call("update_shared_object", { ...session, collection, objectId, expectedRevision: 7, ...data });
    await call("delete_shared_object", { ...session, collection, objectId, expectedRevision: 8 });
    expect(calls().map(([url,o]) => [o.method,new URL(url).pathname])).toEqual([
      ["GET","/api/v1/app/shared-objects/collections"],["GET","/api/v1/app/shared-objects/map/usage"],
      ["GET",`/api/v1/app/shared-objects/map/objects/${objectId}`],["POST","/api/v1/app/shared-objects/map/query"],
      ["POST","/api/v1/app/shared-objects/map/objects"],["PUT",`/api/v1/app/shared-objects/map/objects/${objectId}`],["DELETE",`/api/v1/app/shared-objects/map/objects/${objectId}`]]);
    expect(new URL(calls()[0][0]).searchParams.get("catalogRevision")).toBe("0");
    expect(JSON.parse(calls()[3][1].body as string)).toEqual({userId,...query});
    for(const index of [4,5]) expect(JSON.parse(calls()[index][1].body as string)).toEqual({userId,...data});
    expect(calls()[4][1].headers).toHaveProperty("If-Match","0");expect(calls()[5][1].headers).toHaveProperty("If-Match","7");
    expect(calls()[6][1].headers).toHaveProperty("If-Match","8");expect(calls()[6][1].body).toBeUndefined();
    expect(new URL(calls()[6][0]).searchParams.get("userId")).toBe(userId);
    for(const [url,options] of calls()){
      expect(options.headers).toMatchObject({"X-API-Key":"fixture-app-key",Authorization:"Bearer fixture-player-session"});
      expect(options.headers).not.toHaveProperty("X-Account-API-Key");expect(url).not.toContain(session.sessionToken);
    }
    expect(request).toHaveBeenCalledTimes(7);
  });
  it("preserves explicit empty cursor pages and never fetches the next page automatically", async () => {
    const empty={objects:[],nextCursor:"original_cursor",pollAfterSeconds:120,serverTime:snapshot.serverTime};
    request.mockImplementation(async()=>new Response(JSON.stringify(empty)));
    expect(body(await call("query_shared_objects",{...session,collection,query:{mode:"owner",ownerId:userId,groupId:objectId}}))).toEqual(empty);
    await call("query_shared_objects",{...session,collection,query:{mode:"owner",ownerId:userId,groupId:objectId,cursor:empty.nextCursor}});
    expect(JSON.parse(calls()[1][1].body as string).cursor).toBe(empty.nextCursor);expect(request).toHaveBeenCalledTimes(2);
  });
  it("rejects malformed bytes Unicode unsafe integers and mixed query modes before HTTP", async () => {
    for(const dataBase64 of ["AA","AB==","AA==\n","_w==","x".repeat(87385)])
      expect((await call("create_shared_object",{...session,collection,expectedRevision:0,...data,dataBase64})).isError).toBe(true);
    for(const search of [{power:null},{power:1.5},{power:"\ud800"},{power:9007199254740992},{power:"😀".repeat(25)},{a:1,b:1,c:1,d:1},{"bad.dot":1}])
      expect((await call("update_shared_object",{...session,collection,objectId,expectedRevision:7,...data,search})).isError).toBe(true);
    for(const query of [{mode:"list",field:"power"},{mode:"owner"},{mode:"field",field:"power",equal:1,min:0,max:2},
      {mode:"random",field:"power",min:1,max:2,cursor:"old"},{mode:"random",field:"label",min:"a",max:"b"},
      {mode:"rectangle",minX:1,maxX:0,minY:0,maxY:1},{mode:"list",limit:51},{mode:"list",userId},{mode:"list",cursor:null}])
      expect((await call("query_shared_objects",{...session,collection,query})).isError).toBe(true);
    for(const expectedRevision of [undefined,null,-1,1.5,"0",9007199254740992])
      expect((await call("delete_shared_object",{...session,collection,objectId,expectedRevision})).isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
  it("uses original revisions once on lost responses conflicts throttling and server errors",async()=>{
    request.mockImplementationOnce(async()=>{throw new Error("lost response")});
    expect((await call("create_shared_object",{...session,collection,expectedRevision:0,...data})).isError).toBe(true);
    for(const [status,code] of [[409,"REVISION_CONFLICT"],[409,"STATE_CONFLICT"],[422,"STORAGE_LIMIT_REACHED"],[429,"RATE_LIMIT_EXCEEDED"],[503,"TEMPORARILY_UNAVAILABLE"]] as const){
      request.mockImplementationOnce(async()=>new Response(JSON.stringify({code}),{status}));
      const result=await call("update_shared_object",{...session,collection,objectId,expectedRevision:7,...data});
      expect(result.isError).toBe(true);expect((result.content as {text:string}[])[0].text).toContain(code);
    }
    expect(request).toHaveBeenCalledTimes(6);expect(calls().slice(1).every(([,o])=>(o.headers as Record<string,string>)["If-Match"]==="7")).toBe(true);
  });
  it("maps all ten admin routes with scoped credentials original owner and revision",async()=>{
    await call("admin_shared_collections_get",{...project,afterKey:"a",limit:2,catalogRevision:0});
    await call("admin_shared_collection_set",{...project,collection,expectedRevision:3,definition});
    await call("admin_shared_limits",project);await call("admin_shared_usage",{...project,collection,userId});
    await call("admin_shared_object_get",{...project,collection,objectId});await call("admin_shared_objects_query",{...project,collection,query:{mode:"list",ownerId:userId}});
    await call("admin_shared_object_create",{...project,collection,ownerId:userId,expectedRevision:0,...data});
    await call("admin_shared_object_update",{...project,collection,objectId,expectedRevision:7,...data});
    await call("admin_shared_object_delete",{...project,collection,objectId,expectedRevision:8});await call("admin_shared_cleanup",project);
    expect(calls().map(([,o])=>o.method)).toEqual(["GET","PUT","GET","GET","GET","POST","POST","PUT","DELETE","POST"]);
    expect(JSON.parse(calls()[1][1].body as string)).toEqual(definition);expect(calls()[1][1].headers).toHaveProperty("If-Match","3");
    expect(JSON.parse(calls()[6][1].body as string)).toEqual({ownerId:userId,...data});
    expect(JSON.parse(calls()[7][1].body as string)).toEqual(data);expect(calls()[7][1].headers).toHaveProperty("If-Match","7");
    for(const [url,options] of calls()){
      expect(new URL(url).searchParams.get("apiKeyId")).toBe(projectApiKeyId);expect(options.headers).toHaveProperty("X-Account-API-Key","fixture-account-key");
      expect(options.headers).not.toHaveProperty("X-API-Key");expect(options.headers).not.toHaveProperty("Authorization");
    }
    expect(request).toHaveBeenCalledTimes(10);
  });
  it("rejects immutable definition mistakes and oversized fields without coercion",async()=>{
    for(const changes of [{readPolicy:"dashboard"},{maxObjectsPerOwner:0},{ttlSeconds:59},{ttlSeconds:"60"},{maxObjectBytes:65537},
      {name:"é".repeat(61)},{searchFields:[definition.searchFields[0],definition.searchFields[0]]},{used:true},{active:"true"}])
      expect((await call("admin_shared_collection_set",{...project,collection,expectedRevision:0,definition:{...definition,...changes}})).isError).toBe(true);
    expect((await call("admin_shared_object_create",{...project,collection,expectedRevision:0,...data})).isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
  it("exposes honest documentation engine prompts and read-only query annotations",async()=>{
    const {tools}=await client.listTools();
    expect(tools.filter(t=>t.name.includes("shared_")||t.name==="horizon_admin_inbox_send_ordinary")).toHaveLength(18);
    expect(tools.find(t=>t.name==="horizon_query_shared_objects")?.annotations).toMatchObject({readOnlyHint:true});
    expect(tools.find(t=>t.name==="horizon_admin_shared_objects_query")?.annotations).toMatchObject({readOnlyHint:true});
    expect(tools.find(t=>t.name==="horizon_create_shared_object")?.annotations).toMatchObject({readOnlyHint:false,destructiveHint:false,idempotentHint:true});
    expect(tools.find(t=>t.name==="horizon_admin_shared_cleanup")?.annotations).toMatchObject({idempotentHint:false});
    expect((await client.readResource({uri:"horizon://docs/shared-objects"})).contents[0]).toMatchObject({text:expect.stringContaining("owner usage")});
    for(const engine of ["unity","godot","unreal"])expect((await client.getPrompt({name:"integrate-feature",arguments:{feature:"shared-objects",engine}})).messages[0].content)
      .toMatchObject({text:expect.stringContaining("horizon://docs/shared-objects")});
    expect(request).not.toHaveBeenCalled();
  });
});
