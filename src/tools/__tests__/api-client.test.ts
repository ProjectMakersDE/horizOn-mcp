import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  HorizonApiClient,
  HorizonApiError,
  createApiClientFromEnv,
} from "../api-client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetchResponse(
  body: unknown,
  init?: { status?: number; ok?: boolean },
) {
  const status = init?.status ?? 200;
  const ok = init?.ok ?? (status >= 200 && status < 300);

  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    text: async () =>
      typeof body === "string" ? body : JSON.stringify(body),
  } as unknown as Response);
}

// ---------------------------------------------------------------------------
// HorizonApiClient
// ---------------------------------------------------------------------------

describe("HorizonApiClient", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws if no API key is provided", () => {
    expect(() => new HorizonApiClient("", "https://example.com")).toThrow(
      "API key must not be empty",
    );
  });

  it("GET sends X-API-Key header", async () => {
    const fakeFetch = mockFetchResponse({ ok: true });
    vi.stubGlobal("fetch", fakeFetch);

    const client = new HorizonApiClient("test-key", "https://example.com");
    await client.get("/api/v1/test");

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, options] = fakeFetch.mock.calls[0];
    expect(url).toBe("https://example.com/api/v1/test");
    expect(options.method).toBe("GET");
    expect(options.headers["X-API-Key"]).toBe("test-key");
    expect(options.headers["Content-Type"]).toBe("application/json");
  });

  it("GET appends query params", async () => {
    const fakeFetch = mockFetchResponse({ items: [] });
    vi.stubGlobal("fetch", fakeFetch);

    const client = new HorizonApiClient("key", "https://example.com");
    await client.get("/api/v1/items", { limit: "10", offset: "0" });

    const [url] = fakeFetch.mock.calls[0];
    expect(url).toContain("?");
    expect(url).toContain("limit=10");
    expect(url).toContain("offset=0");
  });

  it("POST sends JSON body and correct headers", async () => {
    const fakeFetch = mockFetchResponse({ id: "123" });
    vi.stubGlobal("fetch", fakeFetch);

    const client = new HorizonApiClient("my-key", "https://example.com");
    const payload = { name: "test", value: 42 };
    await client.post("/api/v1/create", payload);

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, options] = fakeFetch.mock.calls[0];
    expect(url).toBe("https://example.com/api/v1/create");
    expect(options.method).toBe("POST");
    expect(options.headers["X-API-Key"]).toBe("my-key");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.body).toBe(JSON.stringify(payload));
  });

  it("POST without body sends undefined body", async () => {
    const fakeFetch = mockFetchResponse({ done: true });
    vi.stubGlobal("fetch", fakeFetch);

    const client = new HorizonApiClient("key", "https://example.com");
    await client.post("/api/v1/action");

    const [, options] = fakeFetch.mock.calls[0];
    expect(options.body).toBeUndefined();
  });

  it("throws HorizonApiError on non-ok response (GET)", async () => {
    const fakeFetch = mockFetchResponse("Not Found", {
      status: 404,
      ok: false,
    });
    vi.stubGlobal("fetch", fakeFetch);

    const client = new HorizonApiClient("key", "https://example.com");

    await expect(client.get("/api/v1/missing")).rejects.toThrow(
      HorizonApiError,
    );
    await expect(client.get("/api/v1/missing")).rejects.toMatchObject({
      status: 404,
      body: "Not Found",
    });
  });

  it("throws HorizonApiError on non-ok response (POST)", async () => {
    const fakeFetch = mockFetchResponse("Bad Request", {
      status: 400,
      ok: false,
    });
    vi.stubGlobal("fetch", fakeFetch);

    const client = new HorizonApiClient("key", "https://example.com");

    await expect(
      client.post("/api/v1/create", { bad: true }),
    ).rejects.toThrow(HorizonApiError);
    await expect(
      client.post("/api/v1/create", { bad: true }),
    ).rejects.toMatchObject({
      status: 400,
      body: "Bad Request",
    });
  });

  it("handles network errors", async () => {
    const fakeFetch = vi
      .fn()
      .mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fakeFetch);

    const client = new HorizonApiClient("key", "https://example.com");

    await expect(client.get("/api/v1/test")).rejects.toThrow("fetch failed");
    await expect(client.post("/api/v1/test")).rejects.toThrow("fetch failed");
  });

  it("strips trailing slash from base URL", async () => {
    const fakeFetch = mockFetchResponse({});
    vi.stubGlobal("fetch", fakeFetch);

    const client = new HorizonApiClient("key", "https://example.com/");
    await client.get("/api/v1/test");

    const [url] = fakeFetch.mock.calls[0];
    expect(url).toBe("https://example.com/api/v1/test");
  });
});

// ---------------------------------------------------------------------------
// createApiClientFromEnv
// ---------------------------------------------------------------------------

describe("createApiClientFromEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.HORIZON_API_KEY;
    delete process.env.HORIZON_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns null when HORIZON_API_KEY is not set", () => {
    expect(createApiClientFromEnv()).toBeNull();
  });

  it("returns a client when HORIZON_API_KEY is set", () => {
    process.env.HORIZON_API_KEY = "some-key";
    const client = createApiClientFromEnv();
    expect(client).toBeInstanceOf(HorizonApiClient);
  });

  it("uses HORIZON_BASE_URL when provided", async () => {
    process.env.HORIZON_API_KEY = "some-key";
    process.env.HORIZON_BASE_URL = "https://custom.example.com";

    const fakeFetch = mockFetchResponse({});
    vi.stubGlobal("fetch", fakeFetch);

    const client = createApiClientFromEnv()!;
    await client.get("/test");

    const [url] = fakeFetch.mock.calls[0];
    expect(url).toBe("https://custom.example.com/test");

    globalThis.fetch = globalThis.fetch; // restored in afterEach via vi.stubGlobal
  });

  it("defaults to https://horizon.pm when HORIZON_BASE_URL is not set", async () => {
    process.env.HORIZON_API_KEY = "some-key";

    const fakeFetch = mockFetchResponse({});
    vi.stubGlobal("fetch", fakeFetch);

    const client = createApiClientFromEnv()!;
    await client.get("/test");

    const [url] = fakeFetch.mock.calls[0];
    expect(url).toBe("https://horizon.pm/test");
  });
});
