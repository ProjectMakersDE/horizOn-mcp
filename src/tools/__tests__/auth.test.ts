import { createServer as httpServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";

// Contract checked 2026-11-17: Live /v3/api-docs/app, Server 1.78.1
// AppUserController, UserManagementManager and UserSessionService (origin/release).
// The local HTTP fixture exercises MCP validation and the actual HTTP client only.
const userId = "550e8400-e29b-41d4-a716-446655440001";
const anonymousToken = "aB2cD3eF4gH5iJ6kL7mN8oP9qR0sT1uV";
const pair = {
  accessToken: "fixture-new-access",
  refreshToken: "fixture-new-refresh",
  accessTokenExpiresAt: "2026-11-17T13:00:00",
  refreshTokenExpiresAt: "2026-12-17T12:00:00",
  tokenType: "Bearer",
};
let client: Client, http: Server, status: number, responseBody: unknown, dropResponse: boolean;
let requests: { path: string; body: Record<string, unknown>; headers: Record<string, unknown> }[];
const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });
const data = (result: Awaited<ReturnType<typeof call>>) => JSON.parse((result.content as { text: string }[])[0].text);

beforeEach(async () => {
  requests = []; status = 200; responseBody = { userId, accessToken: "fixture-access", authStatus: "AUTHENTICATED" }; dropResponse = false;
  vi.stubEnv("HORIZON_API_KEY", "fixture-project-key");
  vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "");
  for (const method of ["error", "log", "warn", "info"] as const) vi.spyOn(console, method).mockImplementation(() => {});
  http = httpServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    requests.push({ path: req.url!, body, headers: req.headers });
    if (dropResponse) { req.socket.destroy(); return; }
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(responseBody === null ? undefined : JSON.stringify(responseBody));
  });
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  vi.stubEnv("HORIZON_BASE_URL", `http://127.0.0.1:${(http.address() as { port: number }).port}`);
  client = new Client({ name: "auth-http-fixtures", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer().connect(b), client.connect(a)]);
});

afterEach(async () => {
  await client.close(); http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve()));
  vi.unstubAllEnvs(); vi.restoreAllMocks();
});

describe("auth contracts over actual MCP and loopback HTTP", () => {
  it.each([
    ["horizon_signup_anonymous", "signup", { displayName: "Guest" }, { type: "ANONYMOUS", username: "Guest" }],
    ["horizon_signup_email", "signup", { displayName: "Player", email: "player@example.test", password: "fixture-password" }, { type: "EMAIL", username: "Player", email: "player@example.test", password: "fixture-password" }],
    ["horizon_signin_email", "signin", { email: "player@example.test", password: "fixture-password" }, { type: "EMAIL", email: "player@example.test", password: "fixture-password" }],
    ["horizon_signin_anonymous", "signin", { anonymousToken }, { type: "ANONYMOUS", anonymousToken }],
  ] as const)("keeps %s compatible and forwards only explicit refresh choices", async (name, path, args, body) => {
    for (const choice of [undefined, false, true]) {
      const options = choice === undefined ? {} : { includeRefreshToken: choice };
      const result = await call(name, { ...args, ...options });
      expect(result.isError).toBeFalsy();
      expect(requests.at(-1)!.path).toBe(`/api/v1/app/user-management/${path}`);
      expect(requests.at(-1)!.body).toEqual({ ...body, ...options });
      expect(requests.at(-1)!.headers["x-api-key"]).toBe("fixture-project-key");
      expect(requests.at(-1)!.headers.authorization).toBeUndefined();
    }
    expect(requests).toHaveLength(3);
  });

  it("preserves the server-issued guest credential and opted-in session in one signup response", async () => {
    status = 201; responseBody = { userId, anonymousToken, isAnonymous: true, isVerified: true, authStatus: "AUTHENTICATED", ...pair };
    const result = await call("horizon_signup_anonymous", { displayName: "Guest", includeRefreshToken: true });
    expect(data(result)).toEqual(responseBody);
    expect(requests[0].body).toEqual({ type: "ANONYMOUS", username: "Guest", includeRefreshToken: true });
    expect(requests[0].body).not.toHaveProperty("anonymousToken");
    expect(requests).toHaveLength(1);
  });

  it("returns the unverified signup status without inventing session tokens or an automatic signin", async () => {
    status = 201; responseBody = { userId, isVerified: false, authStatus: "USER_NOT_VERIFIED" };
    const result = await call("horizon_signup_email", { displayName: "Player", email: "player@example.test", password: "fixture-password", includeRefreshToken: true });
    expect(data(result)).toEqual(responseBody); expect(data(result).accessToken).toBeUndefined(); expect(requests).toHaveLength(1);
  });

  it("sends Google one-click auth through one signup exchange and keeps strict signup as the default", async () => {
    const args = { googleAuthorizationCode: "fixture-google-code", googleRedirectUri: "https://game.example.test/oauth" };
    status = 201; responseBody = { userId, authStatus: "AUTHENTICATED", ...pair };
    expect(data(await call("horizon_signup_google", { ...args, signInIfExists: true, includeRefreshToken: true }))).toEqual(responseBody);
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toEqual({ type: "GOOGLE", ...args, signInIfExists: true, includeRefreshToken: true });
    await call("horizon_signup_google", args);
    expect(requests[1].body).toEqual({ type: "GOOGLE", ...args });
  });

  it("surfaces a Google signin miss without signup or reuse of its single-use code", async () => {
    status = 404; responseBody = { authStatus: "USER_NOT_FOUND" };
    const result = await call("horizon_signin_google", { googleAuthorizationCode: "fixture-google-code", googleRedirectUri: "", includeRefreshToken: false });
    expect(result.isError).toBe(true); expect(JSON.stringify(result)).toContain("USER_NOT_FOUND");
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toEqual({ type: "GOOGLE", googleAuthorizationCode: "fixture-google-code", googleRedirectUri: "", includeRefreshToken: false });
  });

  it.each(["USER_NOT_FOUND", "APPLE_NOT_CONFIGURED", "INVALID_APPLE_TOKEN"])("surfaces Apple %s without automatically creating an account", async authStatus => {
    status = authStatus === "USER_NOT_FOUND" ? 404 : 400; responseBody = { authStatus };
    const result = await call("horizon_signin_apple", { appleIdentityToken: "fixture-apple-jwt", includeRefreshToken: true });
    expect(result.isError).toBe(true); expect(JSON.stringify(result)).toContain(authStatus);
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toEqual({ type: "APPLE", appleIdentityToken: "fixture-apple-jwt", includeRefreshToken: true });
  });

  it("passes Apple first-consent name fields and refresh opt-in without invented provider options", async () => {
    status = 201;
    await call("horizon_signup_apple", { appleIdentityToken: "fixture-apple-jwt", appleFirstName: "Player", appleLastName: "One", includeRefreshToken: true });
    expect(requests[0].body).toEqual({ type: "APPLE", appleIdentityToken: "fixture-apple-jwt", appleFirstName: "Player", appleLastName: "One", includeRefreshToken: true });
    expect(requests).toHaveLength(1);
  });

  it("rotates using only the refresh token and project key, returning both successor tokens and expiry fields", async () => {
    responseBody = pair;
    expect(data(await call("horizon_refresh_session", { refreshToken: "fixture-old-refresh" }))).toEqual(pair);
    expect(requests).toHaveLength(1); expect(requests[0].path).toBe("/api/v1/app/user-management/refresh-session");
    expect(requests[0].body).toEqual({ refreshToken: "fixture-old-refresh" });
    expect(requests[0].headers.authorization).toBeUndefined(); expect(requests[0].headers["x-api-key"]).toBe("fixture-project-key");
  });

  it("surfaces refresh reuse and clearing guidance once while redacting an upstream credential echo", async () => {
    status = 401; responseBody = { code: "REFRESH_TOKEN_REUSED", error: "invalid fixture-old-refresh" };
    const result = await call("horizon_refresh_session", { refreshToken: "fixture-old-refresh" });
    expect(result.isError).toBe(true); const text = JSON.stringify(result);
    expect(text).toContain("REFRESH_TOKEN_REUSED"); expect(text).toContain("clearing local family credentials");
    expect(text).not.toContain("fixture-old-refresh"); expect(requests).toHaveLength(1);
  });

  it("does not retry a consumed refresh when the HTTP response is lost", async () => {
    dropResponse = true;
    const result = await call("horizon_refresh_session", { refreshToken: "fixture-old-refresh" });
    expect(result.isError).toBe(true); expect(JSON.stringify(result)).toContain("do not reuse this refresh token");
    expect(requests).toHaveLength(1);
  });

  it.each([undefined, false, true])("signout sends Bearer access and an explicit allSessions flag (%s), accepting empty 204", async allSessions => {
    status = 204; responseBody = null;
    const result = await call("horizon_signout", { sessionToken: "fixture-access", ...(allSessions === undefined ? {} : { allSessions }) });
    expect(result.isError).toBeFalsy(); expect(data(result)).toBeNull(); expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe("/api/v1/app/user-management/signout");
    expect(requests[0].headers.authorization).toBe("Bearer fixture-access"); expect(requests[0].body).toEqual({ allSessions: allSessions ?? false });
  });

  it("keeps check-auth and name-change session credentials in their request bodies and preserves failure status", async () => {
    responseBody = { isAuthenticated: false, authStatus: "INVALID_CREDENTIALS", message: "Invalid session" };
    for (const name of ["horizon_check_auth", "horizon_change_name"]) {
      const args = { userId, sessionToken: "fixture-access", ...(name.endsWith("change_name") ? { newName: "New name" } : {}) };
      const result = await call(name, args);
      expect(result.isError).toBeFalsy(); expect(data(result)).toEqual(responseBody);
      expect(requests.at(-1)!.body).toEqual(args); expect(requests.at(-1)!.headers.authorization).toBeUndefined();
    }
    expect(requests).toHaveLength(2);
  });

  it.each([
    ["horizon_verify_email", "verify-email", { token: "fixture-verification" }],
    ["horizon_forgot_password", "forgot-password", { email: "unknown@example.test" }],
    ["horizon_reset_password", "reset-password", { token: "fixture-reset", newPassword: "fixture-new-password" }],
  ] as const)("sends %s once and accepts empty success", async (name, path, args) => {
    responseBody = null;
    const result = await call(name, args);
    expect(result.isError).toBeFalsy(); expect(data(result)).toBeNull(); expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe(`/api/v1/app/user-management/${path}`); expect(requests[0].body).toEqual(args);
    expect(requests[0].headers.authorization).toBeUndefined();
  });

  it("does not echo reset credentials in error output or console logs", async () => {
    const newPassword = 'fixture-"quoted"\n-password';
    status = 400; responseBody = { error: `bad fixture-reset and ${newPassword}` };
    const result = await call("horizon_reset_password", { token: "fixture-reset", newPassword });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/fixture-reset|quoted/);
    for (const method of ["error", "log", "warn", "info"] as const) expect(JSON.stringify(vi.mocked(console[method]).mock.calls)).not.toMatch(/fixture-reset|quoted/);
  });

  it.each([
    ["horizon_refresh_session", { refreshToken: "x".repeat(513) }],
    ["horizon_signup_google", { googleAuthorizationCode: "x".repeat(2001), googleRedirectUri: "" }],
    ["horizon_signin_apple", { appleIdentityToken: "x".repeat(4097) }],
    ["horizon_change_name", { userId, sessionToken: "fixture-access", newName: "x".repeat(51) }],
    ["horizon_reset_password", { token: "fixture-reset", newPassword: "short" }],
  ])("validates %s input before HTTP", async (name, args) => {
    expect((await call(name, args)).isError).toBe(true); expect(requests).toHaveLength(0);
  });

  it("supports Apple and explicit long sessions in setup-auth without authorizing automatic live auth tests", async () => {
    const result = await client.getPrompt({ name: "setup-auth", arguments: { engine: "godot", method: "apple", session: "refresh" } });
    const text = JSON.stringify(result);
    expect(text).toContain("USER_NOT_FOUND"); expect(text).toContain("includeRefreshToken=true");
    expect(text).toContain("one refresh in flight"); expect(text).toContain("Never retry a lost/uncertain refresh response");
    expect(text).toContain("Do not create live accounts"); expect(requests).toHaveLength(0);
    expect(JSON.stringify(await client.getPrompt({ name: "setup-auth", arguments: { engine: "unity", method: "email" } }))).toContain("includeRefreshToken omitted/false");
  });
});
