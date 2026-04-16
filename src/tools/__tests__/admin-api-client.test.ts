import { describe, it, expect, afterEach, vi } from "vitest";
import { createAdminApiClientFromEnv } from "../admin-api-client.js";
import { HorizonApiClient } from "../api-client.js";

function mockFetchResponse(body: unknown, init?: { status?: number; ok?: boolean }) {
  const status = init?.status ?? 200;
  const ok = init?.ok ?? (status >= 200 && status < 300);
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as unknown as Response);
}

describe("createAdminApiClientFromEnv", () => {
  const originalKey = process.env.HORIZON_ACCOUNT_API_KEY;
  const originalUrl = process.env.HORIZON_BASE_URL;

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.HORIZON_ACCOUNT_API_KEY = originalKey;
    } else {
      delete process.env.HORIZON_ACCOUNT_API_KEY;
    }
    if (originalUrl !== undefined) {
      process.env.HORIZON_BASE_URL = originalUrl;
    } else {
      delete process.env.HORIZON_BASE_URL;
    }
    vi.unstubAllGlobals();
  });

  it("returns null without HORIZON_ACCOUNT_API_KEY", () => {
    delete process.env.HORIZON_ACCOUNT_API_KEY;
    expect(createAdminApiClientFromEnv()).toBeNull();
  });

  it("returns a HorizonApiClient when HORIZON_ACCOUNT_API_KEY is set", () => {
    process.env.HORIZON_ACCOUNT_API_KEY = "test";
    const client = createAdminApiClientFromEnv();
    expect(client).not.toBeNull();
    expect(client).toBeInstanceOf(HorizonApiClient);
  });

  it("uses X-Account-API-Key header for requests", async () => {
    process.env.HORIZON_ACCOUNT_API_KEY = "test-key";
    process.env.HORIZON_BASE_URL = "https://example.com";

    const fakeFetch = mockFetchResponse({ ok: true });
    vi.stubGlobal("fetch", fakeFetch);

    const client = createAdminApiClientFromEnv()!;
    await client.get("/api/v1/admin/ping");

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, options] = fakeFetch.mock.calls[0];
    expect(url).toBe("https://example.com/api/v1/admin/ping");
    expect(options.headers["X-Account-API-Key"]).toBe("test-key");
    expect(options.headers["X-API-Key"]).toBeUndefined();
    expect(options.headers["Content-Type"]).toBe("application/json");
  });

  it("defaults baseUrl to https://horizon.pm", async () => {
    process.env.HORIZON_ACCOUNT_API_KEY = "k";
    delete process.env.HORIZON_BASE_URL;

    const fakeFetch = mockFetchResponse({});
    vi.stubGlobal("fetch", fakeFetch);

    const client = createAdminApiClientFromEnv()!;
    await client.get("/api/v1/admin/ping");

    const [url] = fakeFetch.mock.calls[0];
    expect(url).toBe("https://horizon.pm/api/v1/admin/ping");
  });
});
