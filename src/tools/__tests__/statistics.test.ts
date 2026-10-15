import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerStatisticsTools, statisticUpdates, statisticOperation, statisticDefinition } from "../statistics.js";
import { registerAdminStatisticsTools } from "../admin/statistics.js";

const USER = "550e8400-e29b-41d4-a716-446655440001";
const PROJECT = "550e8400-e29b-41d4-a716-446655440002";
const OPERATION = "1792000000000:550e8400-e29b-41d4-a716-446655440003";
const snapshot = { userId: USER, definitionVersion: 0, definitions: [], revision: 1, values: [], operationWindow: { serverTimeUnixMillis: 1792000000000, maxAgeSeconds:86400, maxFutureSkewSeconds:30 }, operationId:OPERATION, replayed:false, newlyUnlocked:[] };
const tools = new Map<string, { config: any; handler: Function }>();
const fetchMock = vi.fn();
const invoke = (name:string, args:unknown) => tools.get(name)!.handler(args);
beforeEach(() => {
  vi.stubEnv("HORIZON_API_KEY", "project-key"); vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "account-key"); vi.stubEnv("HORIZON_BASE_URL", "http://127.0.0.1:18807");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response(JSON.stringify(snapshot), { status:200 }));
  const server = { registerTool(name:string,config:any,handler:Function) { tools.set(name,{config,handler}); } } as unknown as McpServer;
  registerStatisticsTools(server); registerAdminStatisticsTools(server);
});
afterEach(() => { tools.clear(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); fetchMock.mockReset(); });

describe("statistics HTTP contract", () => {
  it("preserves the exact original operation and safe integers on every explicit retry", async () => {
    const args = { userId:USER, sessionToken:"player-session", operationId:OPERATION, updates:[{key:"kills",value:Number.MAX_SAFE_INTEGER}] };
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(snapshot),{status:200}));
    await invoke("horizon_update_statistics",args); await invoke("horizon_update_statistics",args);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url,options] of fetchMock.mock.calls) {
      expect(url).toBe("http://127.0.0.1:18807/api/v1/app/statistics");
      expect(options.method).toBe("POST"); expect(options.headers.Authorization).toBe("Bearer player-session");
      expect(JSON.parse(options.body)).toEqual({userId:USER,operationId:OPERATION,updates:args.updates});
      expect(options.body).toContain('"value":9007199254740991');
    }
  });
  it("keeps version zero and matching bearer headers in both conditional reads", async () => {
    await invoke("horizon_get_statistics",{userId:USER,sessionToken:"player-session",definitionVersion:0});
    fetchMock.mockResolvedValueOnce(new Response('{"definitionVersion":0,"definitions":null}',{status:200}));
    await invoke("horizon_get_statistics_definitions",{sessionToken:"player-session",definitionVersion:0});
    expect(fetchMock.mock.calls[0][0]).toBe(`http://127.0.0.1:18807/api/v1/app/statistics?userId=${USER}&definitionVersion=0`);
    expect(fetchMock.mock.calls[1][0]).toBe("http://127.0.0.1:18807/api/v1/app/statistics/definitions?definitionVersion=0");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe("Bearer player-session");
  });
  it("replaces only the selected project catalog with the numeric If-Match header", async () => {
    const definitions = [{key:"kills",name:"Kills",mode:"sum",reset:"none"}];
    await invoke("horizon_admin_statistics_definitions_set",{projectApiKeyId:PROJECT,expectedVersion:4,definitions});
    const [url,options] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://127.0.0.1:18807/api/v1/admin/statistics/definitions?apiKeyId=${PROJECT}`);
    expect(options.method).toBe("PUT"); expect(options.headers["X-Account-API-Key"]).toBe("account-key");
    expect(options.headers["If-Match"]).toBe("4"); expect(JSON.parse(options.body)).toEqual({definitions});
  });
  it("keeps owned project scope on support and limits reads", async () => {
    fetchMock.mockImplementation(async () => new Response("{}",{status:200}));
    await invoke("horizon_admin_statistics_player_get",{projectApiKeyId:PROJECT,userId:USER});
    await invoke("horizon_admin_statistics_limits",{projectApiKeyId:PROJECT});
    expect(fetchMock.mock.calls[0][0]).toBe(`http://127.0.0.1:18807/api/v1/admin/statistics/players/${USER}?apiKeyId=${PROJECT}`);
    expect(fetchMock.mock.calls[1][0]).toBe(`http://127.0.0.1:18807/api/v1/admin/statistics/limits?apiKeyId=${PROJECT}`);
  });
  it("rejects floats, string coercion, duplicate keys, unsafe values and malformed IDs in the published schema", () => {
    expect(statisticUpdates.safeParse([{key:"kills",value:-Number.MAX_SAFE_INTEGER}]).success).toBe(true);
    for (const value of [1.5,"1",Number.MAX_SAFE_INTEGER+1,null]) expect(statisticUpdates.safeParse([{key:"kills",value}]).success).toBe(false);
    expect(statisticUpdates.safeParse([{key:"kills",value:1},{key:"kills",value:2}]).success).toBe(false);
    expect(statisticUpdates.safeParse([{key:"kills\n",value:1}]).success).toBe(false);
    expect(statisticOperation.safeParse(OPERATION).success).toBe(true);
    for (const value of [undefined,OPERATION+"\n","new-id"]) expect(statisticOperation.safeParse(value).success).toBe(false);
    expect(statisticDefinition.safeParse({key:"kills",name:"ä".repeat(41),mode:"sum",reset:"none"}).success).toBe(false);
  });
  it("returns stable conflict and expiration codes without automatic retries or replacement IDs", async () => {
    for (const [status,code] of [[409,"OPERATION_CONFLICT"],[410,"OPERATION_EXPIRED"]] as const) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({code,message:"reconcile original intent"}),{status}));
      const result=await invoke("horizon_update_statistics",{userId:USER,sessionToken:"player-session",operationId:OPERATION,updates:[{key:"kills",value:1}]});
      expect(result.isError).toBe(true); expect(result.content[0].text).toContain(code);
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("fails without credentials before making any HTTP call", async () => {
    vi.stubEnv("HORIZON_API_KEY",""); vi.stubEnv("HORIZON_ACCOUNT_API_KEY","");
    expect((await invoke("horizon_get_statistics",{userId:USER,sessionToken:"player-session"})).isError).toBe(true);
    expect((await invoke("horizon_admin_statistics_definitions_get",{projectApiKeyId:PROJECT})).isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
