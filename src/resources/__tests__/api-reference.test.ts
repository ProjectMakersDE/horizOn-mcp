import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createServer } from "../../server.js";

const methods = ["get", "post", "put", "patch", "delete", "head", "options", "trace"];
let client: Client;

beforeEach(async () => {
  vi.stubEnv("HORIZON_API_KEY", "");
  vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "");
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Bundled reference must be available offline"); }));
  const [transport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "app-api-reference-test", version: "1" });
  await Promise.all([client.connect(transport), createServer().connect(serverTransport)]);
});

afterEach(async () => {
  await client.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function readText(uri: string): Promise<string> {
  const { contents } = await client.readResource({ uri });
  const [content] = contents;
  if (!content || !("text" in content)) throw new Error(`Expected text at ${uri}`);
  return content.text;
}

it("exposes every OpenAPI operation and its schemas alongside a registered, readable guide", async () => {
  const source = JSON.parse(readFileSync(new URL("../api/app-openapi.json", import.meta.url), "utf8"));
  const reference = await readText("horizon://api/reference");
  const { resources } = await client.listResources();
  const listed = new Set(resources.map(({ uri }) => uri));
  for (const uri of ["horizon://docs/dashboard", "horizon://docs/self-hosting", "horizon://docs/limits"]) {
    expect(listed.has(uri), uri).toBe(true);
    expect((await readText(uri)).trim(), uri).not.toBe("");
  }
  const expectedOperations = Object.entries(source.paths as Record<string, object>).flatMap(([path, item]) =>
    Object.keys(item).filter(method => methods.includes(method)).map(method => `${method.toUpperCase()} ${path}`));
  const indexOperations = Array.from(reference.matchAll(/^- `([^\n`]+)`/gm), match => match[1]);
  expect(indexOperations.sort()).toEqual(expectedOperations.sort());

  const seen = new Set<string>();
  for (const [, schemaUri, guideUri] of reference.matchAll(/^OpenAPI <([^>]+)> · Guide <([^>]+)>$/gm)) {
    expect(listed.has(guideUri), guideUri).toBe(true);
    expect((await readText(guideUri)).trim(), guideUri).not.toBe("");
    const contract = JSON.parse(await readText(schemaUri));
    for (const [path, item] of Object.entries(contract.paths)) {
      expect(seen.has(path), path).toBe(false);
      expect(item).toEqual(source.paths[path]);
      seen.add(path);
    }
    for (const [, ref] of JSON.stringify(contract).matchAll(/"\$ref":"#\/components\/schemas\/([^"]+)"/g)) {
      expect(contract.components.schemas[ref], `Missing ${ref} in ${schemaUri}`).toEqual(source.components.schemas[ref]);
    }
  }
  expect([...seen].sort()).toEqual(Object.keys(source.paths).sort());
  expect(globalThis.fetch).not.toHaveBeenCalled();
});

it("reads live plan limits on demand without adding credentials", async () => {
  const limits = { plus: { rateLimitSoft: 200, rateLimitHard: 2000, cloudSaveBytes: 10240 } };
  const fetchLimits = vi.fn(async () => new Response(JSON.stringify(limits)));
  vi.stubGlobal("fetch", fetchLimits);
  vi.stubEnv("HORIZON_API_KEY", "fixture-project-key");
  vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "fixture-account-key");
  const response = await readText("horizon://api/feature-limits");
  expect(JSON.parse(response)).toEqual(limits);
  expect(fetchLimits).toHaveBeenCalledExactlyOnceWith(
    "https://horizon.pm/api/v1/public/system/feature-limits",
    { signal: expect.any(AbortSignal) },
  );
});
