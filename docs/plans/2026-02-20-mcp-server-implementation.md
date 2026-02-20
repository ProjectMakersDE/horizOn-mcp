# horizOn MCP Server Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an MCP server that gives AI-first developers (Vibe Coders) curated horizOn documentation, live App API tools, and workflow prompts for integrating horizOn BaaS into Godot, Unity, and Unreal Engine projects.

**Architecture:** Hybrid MCP server with three pillars: Resources (embedded Markdown docs for offline knowledge), Tools (live HTTP calls to the horizOn App API at `https://horizon.pm/api/v1/app/`), and Prompts (workflow templates). TypeScript/Node.js with stdio transport. Published as `horizon-mcp` on npm.

**Tech Stack:** TypeScript, Node.js 18+, `@modelcontextprotocol/sdk`, `zod` (v4 via `zod/v4`), native `fetch` for HTTP. No build step - runs via `tsx`.

**Reference projects (read-only):**
- horizOn-Server: `/home/projectmakers/Dokumente/GitHub/horizOn-Server`
- horizOn-Dashboard: `/home/projectmakers/Dokumente/GitHub/horizOn-Dashboard`
- horizOn-SDK-Godot: `/home/projectmakers/Dokumente/GitHub/horizOn-SDK-Godot`
- horizOn-SDK-Unity: `/home/projectmakers/Dokumente/GitHub/horizOn-SDK-Unity`
- horizOn-Ads (MCP patterns): `/home/projectmakers/Dokumente/GitHub/horizOn-Ads`

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts`
- Create: `src/server.ts`
- Create: `.gitignore`

**Step 1: Create package.json**

```json
{
  "name": "horizon-mcp",
  "version": "0.1.0",
  "description": "MCP server for horizOn Backend-as-a-Service — gives AI coding assistants documentation, live API tools, and workflow prompts for Godot, Unity, and Unreal Engine integration.",
  "type": "module",
  "bin": {
    "horizon-mcp": "src/index.ts"
  },
  "scripts": {
    "start": "tsx src/index.ts",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "keywords": ["mcp", "horizon", "baas", "gamedev", "godot", "unity", "unreal"],
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "@types/node": "^22.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"]
}
```

**Step 3: Create .gitignore**

```
node_modules/
dist/
.env
*.log
```

**Step 4: Create src/server.ts — MCP server factory**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function createServer(): McpServer {
  return new McpServer({
    name: "horizon-mcp",
    version: "0.1.0",
  });
}
```

**Step 5: Create src/index.ts — Entry point**

```typescript
#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
```

**Step 6: Install dependencies**

Run: `npm install`

**Step 7: Verify server starts**

Run: `echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | npx tsx src/index.ts`
Expected: JSON response with `serverInfo.name: "horizon-mcp"`

**Step 8: Commit**

```bash
git add package.json tsconfig.json .gitignore src/index.ts src/server.ts
git commit -m "feat: scaffold MCP server with stdio transport"
```

---

## Task 2: API Client

**Files:**
- Create: `src/tools/api-client.ts`
- Create: `src/tools/__tests__/api-client.test.ts`

**Step 1: Write the failing test**

```typescript
// src/tools/__tests__/api-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HorizonApiClient, HorizonApiError } from "../api-client.js";

describe("HorizonApiClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws if no API key is provided", () => {
    expect(() => new HorizonApiClient("", "https://horizon.pm")).toThrow(
      "HORIZON_API_KEY"
    );
  });

  it("sends GET with X-API-Key header", async () => {
    const mockResponse = { configs: {}, total: 0 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      })
    );

    const client = new HorizonApiClient("test-key", "https://horizon.pm");
    const result = await client.get("/api/v1/app/remote-config/all");

    expect(fetch).toHaveBeenCalledWith(
      "https://horizon.pm/api/v1/app/remote-config/all",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "X-API-Key": "test-key",
        }),
      })
    );
    expect(result).toEqual(mockResponse);
  });

  it("sends POST with JSON body", async () => {
    const mockResponse = { userId: "abc-123", username: "Player1" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(mockResponse),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      })
    );

    const client = new HorizonApiClient("test-key", "https://horizon.pm");
    const body = { type: "ANONYMOUS", username: "Player1" };
    const result = await client.post("/api/v1/app/user-management/signup", body);

    expect(fetch).toHaveBeenCalledWith(
      "https://horizon.pm/api/v1/app/user-management/signup",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-API-Key": "test-key",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(body),
      })
    );
    expect(result).toEqual(mockResponse);
  });

  it("throws HorizonApiError on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Invalid API key"),
      })
    );

    const client = new HorizonApiClient("bad-key", "https://horizon.pm");
    await expect(client.get("/api/v1/app/remote-config/all")).rejects.toThrow(
      HorizonApiError
    );
  });

  it("handles network errors gracefully", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed"))
    );

    const client = new HorizonApiClient("test-key", "https://horizon.pm");
    await expect(client.get("/api/v1/app/remote-config/all")).rejects.toThrow(
      "fetch failed"
    );
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tools/__tests__/api-client.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/tools/api-client.ts

export class HorizonApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string
  ) {
    super(`horizOn API error (${status}): ${body}`);
    this.name = "HorizonApiError";
  }
}

export class HorizonApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl: string) {
    if (!apiKey) {
      throw new Error(
        "HORIZON_API_KEY is not set. Get your API key from the horizOn dashboard at https://horizon.pm"
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const query = new URLSearchParams(params).toString();
      if (query) url += `?${query}`;
    }
    const res = await fetch(url, {
      method: "GET",
      headers: { "X-API-Key": this.apiKey },
    });
    if (!res.ok) {
      throw new HorizonApiError(res.status, await res.text());
    }
    return res.json() as Promise<T>;
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      throw new HorizonApiError(res.status, await res.text());
    }
    return res.json() as Promise<T>;
  }
}

/**
 * Creates an API client from environment variables.
 * Returns null if HORIZON_API_KEY is not set (tools should return a helpful message).
 */
export function createApiClientFromEnv(): HorizonApiClient | null {
  const apiKey = process.env.HORIZON_API_KEY;
  if (!apiKey) return null;
  const baseUrl = process.env.HORIZON_BASE_URL || "https://horizon.pm";
  return new HorizonApiClient(apiKey, baseUrl);
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run src/tools/__tests__/api-client.test.ts`
Expected: PASS (all 4 tests)

**Step 5: Commit**

```bash
git add src/tools/api-client.ts src/tools/__tests__/api-client.test.ts
git commit -m "feat: add horizOn API client with X-API-Key auth"
```

---

## Task 3: Tool Registration Helper + Connection Tool

**Files:**
- Create: `src/tools/index.ts`
- Create: `src/tools/connection.ts`
- Modify: `src/server.ts`

**Step 1: Write the connection tool**

```typescript
// src/tools/connection.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createApiClientFromEnv, HorizonApiError } from "./api-client.js";

export function registerConnectionTools(server: McpServer): void {
  server.registerTool(
    "horizon_test_connection",
    {
      title: "Test horizOn Connection",
      description:
        "Check if the horizOn server is reachable and the API key is valid. " +
        "Use this to verify your setup before calling other tools.",
    },
    async () => {
      const client = createApiClientFromEnv();
      if (!client) {
        return {
          content: [
            {
              type: "text" as const,
              text: "❌ HORIZON_API_KEY is not set.\n\nTo use horizOn tools, set the HORIZON_API_KEY environment variable in your MCP server configuration:\n\n```json\n{\n  \"mcpServers\": {\n    \"horizOn\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"horizon-mcp\"],\n      \"env\": {\n        \"HORIZON_API_KEY\": \"your-api-key-here\"\n      }\n    }\n  }\n}\n```\n\nGet your API key from the horizOn dashboard: https://horizon.pm",
            },
          ],
        };
      }

      try {
        const result = await client.get<{ configs: Record<string, string>; total: number }>(
          "/api/v1/app/remote-config/all"
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `✅ Connection successful!\n\nServer: ${process.env.HORIZON_BASE_URL || "https://horizon.pm"}\nAPI Key: Valid\nRemote configs found: ${result.total}`,
            },
          ],
        };
      } catch (error) {
        if (error instanceof HorizonApiError) {
          return {
            content: [
              {
                type: "text" as const,
                text: `❌ Connection failed (HTTP ${error.status})\n\n${error.body}\n\nCheck that your HORIZON_API_KEY is correct and the server is reachable.`,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ Network error: ${error instanceof Error ? error.message : String(error)}\n\nCheck your internet connection and that ${process.env.HORIZON_BASE_URL || "https://horizon.pm"} is reachable.`,
            },
          ],
        };
      }
    }
  );
}
```

**Step 2: Create tool index**

```typescript
// src/tools/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerConnectionTools } from "./connection.js";

export function registerAllTools(server: McpServer): void {
  registerConnectionTools(server);
}
```

**Step 3: Wire into server.ts**

```typescript
// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "./tools/index.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "horizon-mcp",
    version: "0.1.0",
  });

  registerAllTools(server);

  return server;
}
```

**Step 4: Verify it compiles**

Run: `npx tsx --eval "import { createServer } from './src/server.js'; console.log('OK')"`
Expected: Prints "OK"

**Step 5: Commit**

```bash
git add src/tools/connection.ts src/tools/index.ts src/server.ts
git commit -m "feat: add test_connection tool and tool registration"
```

---

## Task 4: Auth Tools

**Files:**
- Create: `src/tools/auth.ts`
- Modify: `src/tools/index.ts`

**Step 1: Write auth tools**

```typescript
// src/tools/auth.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, HorizonApiError } from "./api-client.js";

function noApiKeyResponse() {
  return {
    content: [
      {
        type: "text" as const,
        text: "HORIZON_API_KEY is not set. Configure it in your MCP server settings. Get your key at https://horizon.pm",
      },
    ],
  };
}

function errorResponse(error: unknown) {
  if (error instanceof HorizonApiError) {
    return {
      content: [
        {
          type: "text" as const,
          text: `horizOn API error (${error.status}): ${error.body}`,
        },
      ],
    };
  }
  return {
    content: [
      {
        type: "text" as const,
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      },
    ],
  };
}

export function registerAuthTools(server: McpServer): void {
  server.registerTool(
    "horizon_signup_anonymous",
    {
      title: "Sign Up Anonymous User",
      description:
        "Create an anonymous user in horizOn. Returns userId and anonymousToken for future sign-ins. " +
        "Anonymous users can be upgraded to email accounts later.",
      inputSchema: z.object({
        displayName: z.string().max(30).describe("Display name for the user (max 30 chars)"),
      }),
    },
    async ({ displayName }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();
      try {
        const result = await client.post("/api/v1/app/user-management/signup", {
          type: "ANONYMOUS",
          username: displayName,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.registerTool(
    "horizon_signup_email",
    {
      title: "Sign Up Email User",
      description:
        "Create a user with email and password in horizOn. " +
        "The user may need to verify their email depending on account settings.",
      inputSchema: z.object({
        email: z.string().email().max(40).describe("User email address"),
        password: z.string().min(4).max(32).describe("Password (4-32 characters)"),
        displayName: z.string().max(30).describe("Display name for the user"),
      }),
    },
    async ({ email, password, displayName }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();
      try {
        const result = await client.post("/api/v1/app/user-management/signup", {
          type: "EMAIL",
          email,
          password,
          username: displayName,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.registerTool(
    "horizon_signin_email",
    {
      title: "Sign In Email User",
      description:
        "Sign in a user with email and password. Returns an accessToken for authenticated operations.",
      inputSchema: z.object({
        email: z.string().email().max(40).describe("User email address"),
        password: z.string().max(32).describe("User password"),
      }),
    },
    async ({ email, password }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();
      try {
        const result = await client.post("/api/v1/app/user-management/signin", {
          type: "EMAIL",
          email,
          password,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.registerTool(
    "horizon_signin_anonymous",
    {
      title: "Sign In Anonymous User",
      description:
        "Sign in a previously created anonymous user using their anonymousToken.",
      inputSchema: z.object({
        anonymousToken: z
          .string()
          .max(32)
          .describe("The anonymousToken returned from signup"),
      }),
    },
    async ({ anonymousToken }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();
      try {
        const result = await client.post("/api/v1/app/user-management/signin", {
          type: "ANONYMOUS",
          anonymousToken,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.registerTool(
    "horizon_check_auth",
    {
      title: "Check Authentication",
      description: "Verify if a user's session token is still valid.",
      inputSchema: z.object({
        userId: z.string().uuid().describe("The user's UUID"),
        sessionToken: z.string().max(256).describe("The session/access token to check"),
      }),
    },
    async ({ userId, sessionToken }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();
      try {
        const result = await client.post("/api/v1/app/user-management/check-auth", {
          userId,
          sessionToken,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}
```

**Step 2: Add to tools/index.ts**

Add `import { registerAuthTools } from "./auth.js";` and call `registerAuthTools(server);` inside `registerAllTools`.

**Step 3: Verify it compiles**

Run: `npx tsx --eval "import { createServer } from './src/server.js'; console.log('OK')"`
Expected: Prints "OK"

**Step 4: Commit**

```bash
git add src/tools/auth.ts src/tools/index.ts
git commit -m "feat: add auth tools (signup, signin, check-auth)"
```

---

## Task 5: Leaderboard Tools

**Files:**
- Create: `src/tools/leaderboard.ts`
- Modify: `src/tools/index.ts`

**Step 1: Write leaderboard tools**

```typescript
// src/tools/leaderboard.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, HorizonApiError } from "./api-client.js";

function noApiKeyResponse() {
  return {
    content: [{ type: "text" as const, text: "HORIZON_API_KEY is not set. Configure it in your MCP server settings." }],
  };
}

function errorResponse(error: unknown) {
  if (error instanceof HorizonApiError) {
    return { content: [{ type: "text" as const, text: `horizOn API error (${error.status}): ${error.body}` }] };
  }
  return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
}

export function registerLeaderboardTools(server: McpServer): void {
  server.registerTool(
    "horizon_submit_score",
    {
      title: "Submit Leaderboard Score",
      description: "Submit a score to the leaderboard. Only updates if the new score is higher than the existing one.",
      inputSchema: z.object({
        userId: z.string().uuid().describe("The user's UUID"),
        score: z.number().int().min(0).describe("The score to submit (non-negative integer)"),
      }),
    },
    async ({ userId, score }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();
      try {
        await client.post("/api/v1/app/leaderboard/submit", { userId, score });
        return { content: [{ type: "text" as const, text: `Score ${score} submitted for user ${userId}.` }] };
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.registerTool(
    "horizon_get_leaderboard_top",
    {
      title: "Get Leaderboard Top Entries",
      description: "Get the top leaderboard entries, sorted by score descending.",
      inputSchema: z.object({
        userId: z.string().uuid().describe("A valid user UUID (required for authentication)"),
        limit: z.number().int().min(1).max(100).default(10).describe("Number of entries to return (1-100, default 10)"),
      }),
    },
    async ({ userId, limit }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();
      try {
        const result = await client.get("/api/v1/app/leaderboard/top", {
          userId,
          limit: String(limit),
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.registerTool(
    "horizon_get_user_rank",
    {
      title: "Get User Rank",
      description: "Get a specific user's rank and score on the leaderboard.",
      inputSchema: z.object({
        userId: z.string().uuid().describe("The user's UUID"),
      }),
    },
    async ({ userId }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();
      try {
        const result = await client.get("/api/v1/app/leaderboard/rank", { userId });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.registerTool(
    "horizon_get_leaderboard_around",
    {
      title: "Get Leaderboard Around User",
      description: "Get leaderboard entries around a specific user's position. Useful for showing context in the leaderboard.",
      inputSchema: z.object({
        userId: z.string().uuid().describe("The user's UUID"),
        range: z.number().int().min(1).max(50).default(10).describe("Number of entries above and below (default 10)"),
      }),
    },
    async ({ userId, range }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();
      try {
        const result = await client.get("/api/v1/app/leaderboard/around", {
          userId,
          range: String(range),
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}
```

**Step 2: Add to tools/index.ts**

Add `import { registerLeaderboardTools } from "./leaderboard.js";` and call `registerLeaderboardTools(server);`.

**Step 3: Commit**

```bash
git add src/tools/leaderboard.ts src/tools/index.ts
git commit -m "feat: add leaderboard tools (submit, top, rank, around)"
```

---

## Task 6: Cloud Save Tools

**Files:**
- Create: `src/tools/cloud-save.ts`
- Modify: `src/tools/index.ts`

**Step 1: Write cloud save tools**

```typescript
// src/tools/cloud-save.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, HorizonApiError } from "./api-client.js";

function noApiKeyResponse() {
  return { content: [{ type: "text" as const, text: "HORIZON_API_KEY is not set. Configure it in your MCP server settings." }] };
}

function errorResponse(error: unknown) {
  if (error instanceof HorizonApiError) {
    return { content: [{ type: "text" as const, text: `horizOn API error (${error.status}): ${error.body}` }] };
  }
  return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
}

export function registerCloudSaveTools(server: McpServer): void {
  server.registerTool(
    "horizon_save_cloud_data",
    {
      title: "Save Cloud Data",
      description:
        "Save JSON data to horizOn cloud storage for a user. " +
        "Size limits depend on account tier: FREE=1KB, BASIC=5KB, PRO=20KB, ENTERPRISE=250KB.",
      inputSchema: z.object({
        userId: z.string().uuid().describe("The user's UUID"),
        data: z.string().max(300000).describe("The data to save (JSON string, max 300KB)"),
      }),
    },
    async ({ userId, data }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();
      try {
        const result = await client.post("/api/v1/app/cloud-save/save", {
          userId,
          saveData: data,
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.registerTool(
    "horizon_load_cloud_data",
    {
      title: "Load Cloud Data",
      description: "Load previously saved cloud data for a user.",
      inputSchema: z.object({
        userId: z.string().uuid().describe("The user's UUID"),
      }),
    },
    async ({ userId }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();
      try {
        const result = await client.post("/api/v1/app/cloud-save/load", { userId });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}
```

**Step 2: Add to tools/index.ts**

Add `import { registerCloudSaveTools } from "./cloud-save.js";` and call `registerCloudSaveTools(server);`.

**Step 3: Commit**

```bash
git add src/tools/cloud-save.ts src/tools/index.ts
git commit -m "feat: add cloud save tools (save, load)"
```

---

## Task 7: Remote Config Tools

**Files:**
- Create: `src/tools/remote-config.ts`
- Modify: `src/tools/index.ts`

**Step 1: Write remote config tools**

```typescript
// src/tools/remote-config.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, HorizonApiError } from "./api-client.js";

function noApiKeyResponse() {
  return { content: [{ type: "text" as const, text: "HORIZON_API_KEY is not set. Configure it in your MCP server settings." }] };
}

function errorResponse(error: unknown) {
  if (error instanceof HorizonApiError) {
    return { content: [{ type: "text" as const, text: `horizOn API error (${error.status}): ${error.body}` }] };
  }
  return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
}

export function registerRemoteConfigTools(server: McpServer): void {
  server.registerTool(
    "horizon_get_remote_config",
    {
      title: "Get Remote Config Value",
      description: "Get a single remote configuration value by key. Use for feature flags, game balance values, or A/B test parameters.",
      inputSchema: z.object({
        key: z.string().max(256).describe("The config key to look up"),
      }),
    },
    async ({ key }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();
      try {
        const result = await client.get(`/api/v1/app/remote-config/${encodeURIComponent(key)}`);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.registerTool(
    "horizon_get_all_remote_configs",
    {
      title: "Get All Remote Configs",
      description: "Get all remote configuration key-value pairs. Useful for loading all game/app settings at startup.",
    },
    async () => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();
      try {
        const result = await client.get("/api/v1/app/remote-config/all");
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}
```

**Step 2: Add to tools/index.ts, commit**

```bash
git add src/tools/remote-config.ts src/tools/index.ts
git commit -m "feat: add remote config tools (get single, get all)"
```

---

## Task 8: News, Gift Codes, Feedback, and User Logs Tools

**Files:**
- Create: `src/tools/news.ts`
- Create: `src/tools/gift-codes.ts`
- Create: `src/tools/feedback.ts`
- Create: `src/tools/user-logs.ts`
- Modify: `src/tools/index.ts`

**Step 1: Write news tool**

```typescript
// src/tools/news.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, HorizonApiError } from "./api-client.js";

function noApiKeyResponse() {
  return { content: [{ type: "text" as const, text: "HORIZON_API_KEY is not set. Configure it in your MCP server settings." }] };
}

function errorResponse(error: unknown) {
  if (error instanceof HorizonApiError) {
    return { content: [{ type: "text" as const, text: `horizOn API error (${error.status}): ${error.body}` }] };
  }
  return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
}

export function registerNewsTools(server: McpServer): void {
  server.registerTool(
    "horizon_get_news",
    {
      title: "Get News",
      description: "Load published news/announcements. Supports language filtering and pagination.",
      inputSchema: z.object({
        limit: z.number().int().min(0).max(100).default(20).describe("Number of entries (0-100, default 20)"),
        languageCode: z.string().length(2).optional().describe("ISO 639-1 language code (e.g., 'en', 'de')"),
      }),
    },
    async ({ limit, languageCode }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();
      try {
        const params: Record<string, string> = { limit: String(limit) };
        if (languageCode) params.languageCode = languageCode;
        const result = await client.get("/api/v1/app/news", params);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}
```

**Step 2: Write gift codes tools**

```typescript
// src/tools/gift-codes.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, HorizonApiError } from "./api-client.js";

function noApiKeyResponse() {
  return { content: [{ type: "text" as const, text: "HORIZON_API_KEY is not set. Configure it in your MCP server settings." }] };
}

function errorResponse(error: unknown) {
  if (error instanceof HorizonApiError) {
    return { content: [{ type: "text" as const, text: `horizOn API error (${error.status}): ${error.body}` }] };
  }
  return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
}

export function registerGiftCodeTools(server: McpServer): void {
  server.registerTool(
    "horizon_validate_gift_code",
    {
      title: "Validate Gift Code",
      description: "Check if a gift code is valid and can be redeemed by the user.",
      inputSchema: z.object({
        code: z.string().max(50).describe("The gift code to validate"),
        userId: z.string().uuid().describe("The user's UUID"),
      }),
    },
    async ({ code, userId }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();
      try {
        const result = await client.post("/api/v1/app/gift-codes/validate", { code, userId });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.registerTool(
    "horizon_redeem_gift_code",
    {
      title: "Redeem Gift Code",
      description: "Redeem a gift code for a user. Returns success status and any gift data (rewards).",
      inputSchema: z.object({
        code: z.string().max(50).describe("The gift code to redeem"),
        userId: z.string().uuid().describe("The user's UUID"),
      }),
    },
    async ({ code, userId }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();
      try {
        const result = await client.post("/api/v1/app/gift-codes/redeem", { code, userId });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}
```

**Step 3: Write feedback tool**

```typescript
// src/tools/feedback.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, HorizonApiError } from "./api-client.js";

function noApiKeyResponse() {
  return { content: [{ type: "text" as const, text: "HORIZON_API_KEY is not set. Configure it in your MCP server settings." }] };
}

function errorResponse(error: unknown) {
  if (error instanceof HorizonApiError) {
    return { content: [{ type: "text" as const, text: `horizOn API error (${error.status}): ${error.body}` }] };
  }
  return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
}

export function registerFeedbackTools(server: McpServer): void {
  server.registerTool(
    "horizon_submit_feedback",
    {
      title: "Submit User Feedback",
      description: "Submit user feedback (bug report, feature request, or general feedback).",
      inputSchema: z.object({
        userId: z.string().uuid().describe("The user's UUID"),
        title: z.string().min(1).max(100).describe("Feedback title"),
        message: z.string().min(1).max(2048).describe("Feedback message"),
        category: z.string().max(50).optional().describe("Category (e.g., 'bug', 'feature', 'general')"),
        email: z.string().email().max(254).optional().describe("Contact email"),
        deviceInfo: z.string().max(500).optional().describe("Device/platform information"),
      }),
    },
    async ({ userId, title, message, category, email, deviceInfo }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();
      try {
        await client.post("/api/v1/app/user-feedback/submit", {
          userId,
          title,
          message,
          category,
          email,
          deviceInfo,
        });
        return { content: [{ type: "text" as const, text: "Feedback submitted successfully." }] };
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}
```

**Step 4: Write user logs tool**

```typescript
// src/tools/user-logs.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, HorizonApiError } from "./api-client.js";

function noApiKeyResponse() {
  return { content: [{ type: "text" as const, text: "HORIZON_API_KEY is not set. Configure it in your MCP server settings." }] };
}

function errorResponse(error: unknown) {
  if (error instanceof HorizonApiError) {
    return { content: [{ type: "text" as const, text: `horizOn API error (${error.status}): ${error.body}` }] };
  }
  return { content: [{ type: "text" as const, text: `Error: ${error instanceof Error ? error.message : String(error)}` }] };
}

export function registerUserLogTools(server: McpServer): void {
  server.registerTool(
    "horizon_create_log",
    {
      title: "Create User Log",
      description:
        "Create a server-side log entry for a user. Useful for error tracking and analytics. " +
        "Note: requires BASIC tier or higher (not available on FREE accounts).",
      inputSchema: z.object({
        userId: z.string().uuid().describe("The user's UUID"),
        message: z.string().max(1000).describe("Log message"),
        type: z.enum(["INFO", "WARN", "ERROR"]).describe("Log level"),
        errorCode: z.string().max(50).optional().describe("Optional error code for categorization"),
      }),
    },
    async ({ userId, message, type, errorCode }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();
      try {
        const result = await client.post("/api/v1/app/user-logs/create", {
          userId,
          message,
          type,
          errorCode,
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}
```

**Step 5: Update tools/index.ts with all new imports**

```typescript
// src/tools/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerConnectionTools } from "./connection.js";
import { registerAuthTools } from "./auth.js";
import { registerLeaderboardTools } from "./leaderboard.js";
import { registerCloudSaveTools } from "./cloud-save.js";
import { registerRemoteConfigTools } from "./remote-config.js";
import { registerNewsTools } from "./news.js";
import { registerGiftCodeTools } from "./gift-codes.js";
import { registerFeedbackTools } from "./feedback.js";
import { registerUserLogTools } from "./user-logs.js";

export function registerAllTools(server: McpServer): void {
  registerConnectionTools(server);
  registerAuthTools(server);
  registerLeaderboardTools(server);
  registerCloudSaveTools(server);
  registerRemoteConfigTools(server);
  registerNewsTools(server);
  registerGiftCodeTools(server);
  registerFeedbackTools(server);
  registerUserLogTools(server);
}
```

**Step 6: Verify compilation**

Run: `npx tsx --eval "import { createServer } from './src/server.js'; console.log('OK')"`
Expected: Prints "OK"

**Step 7: Commit**

```bash
git add src/tools/news.ts src/tools/gift-codes.ts src/tools/feedback.ts src/tools/user-logs.ts src/tools/index.ts
git commit -m "feat: add news, gift codes, feedback, and user logs tools"
```

---

## Task 9: Resources — Overview and Feature Docs

**Files:**
- Create: `src/resources/index.ts`
- Create: `src/resources/docs/overview.md`
- Create: `src/resources/docs/auth.md`
- Create: `src/resources/docs/leaderboard.md`
- Create: `src/resources/docs/cloud-save.md`
- Create: `src/resources/docs/remote-config.md`
- Create: `src/resources/docs/news.md`
- Create: `src/resources/docs/gift-codes.md`
- Create: `src/resources/docs/feedback.md`
- Create: `src/resources/docs/user-logs.md`
- Modify: `src/server.ts`

**Important context for writing docs:** Read the actual horizOn SDK source code and server controllers for accurate information. Reference projects:
- Godot SDK: `/home/projectmakers/Dokumente/GitHub/horizOn-SDK-Godot/addons/horizon_sdk/`
- Unity SDK: `/home/projectmakers/Dokumente/GitHub/horizOn-SDK-Unity/Assets/Plugins/ProjectMakers/horizOn/CloudSDK/`
- Server Controllers: `/home/projectmakers/Dokumente/GitHub/horizOn-Server/src/main/kotlin/com/projectmakers/horizonserver/features/`

**Step 1: Create resource registration**

```typescript
// src/resources/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadDoc(relativePath: string): string {
  return readFileSync(join(__dirname, relativePath), "utf-8");
}

export function registerAllResources(server: McpServer): void {
  // Overview
  server.registerResource("overview", "horizon://overview", {
    title: "horizOn Overview",
    description: "What is horizOn, core features, concepts (Account vs User), tier system",
    mimeType: "text/markdown",
  }, async (uri) => ({
    contents: [{ uri: uri.href, text: loadDoc("docs/overview.md") }],
  }));

  // Feature docs
  const features = [
    { name: "auth", title: "Authentication", desc: "User signup/signin (anonymous, email, Google), token handling, password reset" },
    { name: "leaderboard", title: "Leaderboard", desc: "Score submission, top lists, user rank, nearby players" },
    { name: "cloud-save", title: "Cloud Save", desc: "Save/load user data, size limits per tier, JSON and binary formats" },
    { name: "remote-config", title: "Remote Config", desc: "Key-value configuration, feature flags, type-safe access" },
    { name: "news", title: "News", desc: "Multilingual announcements, language filtering, pagination" },
    { name: "gift-codes", title: "Gift Codes", desc: "Code validation, redemption, reward parsing" },
    { name: "feedback", title: "User Feedback", desc: "Bug reports, feature requests, device info capture" },
    { name: "user-logs", title: "User Logs", desc: "Server-side logging (INFO/WARN/ERROR), event tracking" },
  ];

  for (const f of features) {
    server.registerResource(`docs-${f.name}`, `horizon://docs/${f.name}`, {
      title: `horizOn ${f.title}`,
      description: f.desc,
      mimeType: "text/markdown",
    }, async (uri) => ({
      contents: [{ uri: uri.href, text: loadDoc(`docs/${f.name}.md`) }],
    }));
  }

  // API Reference
  server.registerResource("api-reference", "horizon://api/reference", {
    title: "horizOn App API Reference",
    description: "Complete REST API reference for all App API endpoints with request/response schemas",
    mimeType: "text/markdown",
  }, async (uri) => ({
    contents: [{ uri: uri.href, text: loadDoc("api/app-api.md") }],
  }));

  // Quickstart guides
  const engines = [
    { name: "godot", title: "Godot", desc: "Godot 4.5+ SDK installation, configuration, and first integration" },
    { name: "unity", title: "Unity", desc: "Unity 6 SDK installation, configuration, and first integration" },
    { name: "unreal", title: "Unreal Engine", desc: "REST API integration in Unreal Engine (no SDK, direct HTTP calls)" },
  ];

  for (const e of engines) {
    server.registerResource(`quickstart-${e.name}`, `horizon://quickstart/${e.name}`, {
      title: `horizOn Quickstart: ${e.title}`,
      description: e.desc,
      mimeType: "text/markdown",
    }, async (uri) => ({
      contents: [{ uri: uri.href, text: loadDoc(`quickstart/${e.name}.md`) }],
    }));
  }
}
```

**Step 2: Write docs/overview.md**

Write comprehensive overview covering:
- What horizOn is (BaaS for game/app developers)
- Account vs User concept (CRITICAL: Account = developer, User = end-user of developer's app)
- 8 core features listed with 1-sentence descriptions
- Tier system (FREE, BASIC, PRO, ENTERPRISE) with limits table
- API structure (Public/Admin/App — MCP uses App API)
- Base URL: `https://horizon.pm`
- SDK availability: Godot (GDScript), Unity (C#), Unreal (REST)

**Step 3: Write all 8 feature docs**

Each feature doc MUST contain:
1. What it does (1-2 sentences)
2. API Endpoints table with method, path, request body, response body
3. Code example: Godot (GDScript)
4. Code example: Unity (C#)
5. Code example: REST (cURL)
6. Tier limits (if applicable)
7. Common errors and solutions

Source the code examples from the actual SDKs:
- Godot: Read from `/home/projectmakers/Dokumente/GitHub/horizOn-SDK-Godot/addons/horizon_sdk/core/`
- Unity: Read from `/home/projectmakers/Dokumente/GitHub/horizOn-SDK-Unity/Assets/Plugins/ProjectMakers/horizOn/CloudSDK/Manager/`
- REST: Derive from the server controller signatures in Task listing above

**Step 4: Wire resources into server.ts**

```typescript
// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "./tools/index.js";
import { registerAllResources } from "./resources/index.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "horizon-mcp",
    version: "0.1.0",
  });

  registerAllResources(server);
  registerAllTools(server);

  return server;
}
```

**Step 5: Verify compilation**

Run: `npx tsx --eval "import { createServer } from './src/server.js'; console.log('OK')"`
Expected: Prints "OK"

**Step 6: Commit**

```bash
git add src/resources/ src/server.ts
git commit -m "feat: add documentation resources (overview, 8 features, API reference)"
```

---

## Task 10: Resources — API Reference and Quickstart Guides

**Files:**
- Create: `src/resources/api/app-api.md`
- Create: `src/resources/quickstart/godot.md`
- Create: `src/resources/quickstart/unity.md`
- Create: `src/resources/quickstart/unreal.md`

**Step 1: Write app-api.md**

Complete REST API reference covering all 22 App API endpoints. For each endpoint:
- HTTP method and path
- Required headers (`X-API-Key`)
- Request body (field name, type, required/optional, constraints)
- Response body (field name, type)
- Status codes with descriptions

Use the exact endpoint signatures from the horizOn-Server controllers documented earlier in this plan (see design doc section 5 for the full list).

**Step 2: Write godot.md quickstart**

Cover:
1. Install SDK from Godot AssetLib or manually copy to `addons/horizon_sdk/`
2. Enable plugin in Project Settings
3. Export config from horizOn Dashboard → SDK Settings → Download Config
4. Import config: Project > Tools > horizOn: Import Config
5. Connect: `var connected = await Horizon.connect_to_server()`
6. Signup: `var result = await Horizon.auth.signUpAnonymous("Player")`
7. Use features: leaderboard, cloud save, etc.
8. Link to full feature docs

Source from: `/home/projectmakers/Dokumente/GitHub/horizOn-SDK-Godot/README.md` and example files.

**Step 3: Write unity.md quickstart**

Cover:
1. Import package into Unity project (Plugins/ProjectMakers/horizOn/CloudSDK/)
2. Export config from horizOn Dashboard → SDK Settings → Download Config
3. Import config into HorizonConfig asset
4. Initialize: `HorizonApp.Initialize()`
5. Connect: `await new HorizonServer().Connect()`
6. Signup: `await UserManager.Instance.SignUpAnonymous("Player")`
7. Use features
8. Link to full feature docs

Source from: `/home/projectmakers/Dokumente/GitHub/horizOn-SDK-Unity/README.md` and example files.

**Step 4: Write unreal.md quickstart**

Cover:
1. No official SDK — use REST API directly
2. Setup HTTP plugin (VaRest or built-in FHttpModule)
3. Configure API key in project settings
4. Base URL: `https://horizon.pm`
5. Example: Anonymous signup via HTTP POST
6. Example: Submit leaderboard score
7. Example: Load remote config
8. Authentication pattern: always send `X-API-Key` header
9. Link to full API reference

**Step 5: Commit**

```bash
git add src/resources/api/ src/resources/quickstart/
git commit -m "feat: add API reference and quickstart guides (Godot, Unity, Unreal)"
```

---

## Task 11: Prompts

**Files:**
- Create: `src/prompts/index.ts`
- Create: `src/prompts/integrate-feature.ts`
- Create: `src/prompts/setup-auth.ts`
- Create: `src/prompts/debug-connection.ts`
- Create: `src/prompts/explain-feature.ts`
- Modify: `src/server.ts`

**Step 1: Write integrate-feature prompt**

```typescript
// src/prompts/integrate-feature.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

export function registerIntegrateFeaturePrompt(server: McpServer): void {
  server.registerPrompt(
    "integrate-feature",
    {
      title: "Integrate horizOn Feature",
      description:
        "Generate integration code for a specific horizOn feature in your game engine. " +
        "Reads the relevant documentation and produces ready-to-use code.",
      argsSchema: z.object({
        feature: z
          .enum([
            "auth",
            "leaderboard",
            "cloud-save",
            "remote-config",
            "news",
            "gift-codes",
            "feedback",
            "user-logs",
          ])
          .describe("The horizOn feature to integrate"),
        engine: z
          .enum(["godot", "unity", "unreal"])
          .describe("The game engine you are using"),
      }),
    },
    ({ feature, engine }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `I want to integrate the horizOn "${feature}" feature into my ${engine} project.

Please:
1. Read the horizOn documentation for this feature (resource: horizon://docs/${feature})
2. Read the ${engine} quickstart guide (resource: horizon://quickstart/${engine})
3. Generate complete, production-ready integration code
4. Include error handling and best practices
5. Show how to test it works using the horizOn MCP tools

Important: Use the horizOn SDK for ${engine === "godot" ? "Godot (GDScript)" : engine === "unity" ? "Unity (C#)" : "Unreal Engine (REST/HTTP, no SDK)"}`,
          },
        },
      ],
    })
  );
}
```

**Step 2: Write setup-auth prompt**

```typescript
// src/prompts/setup-auth.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

export function registerSetupAuthPrompt(server: McpServer): void {
  server.registerPrompt(
    "setup-auth",
    {
      title: "Setup Authentication",
      description: "Step-by-step guide to set up horizOn authentication in your project.",
      argsSchema: z.object({
        engine: z.enum(["godot", "unity", "unreal"]).describe("Your game engine"),
        method: z
          .enum(["anonymous", "email", "google"])
          .describe("Authentication method to set up"),
      }),
    },
    ({ engine, method }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Set up horizOn ${method} authentication in my ${engine} project.

Please:
1. Read the auth documentation (resource: horizon://docs/auth)
2. Read the ${engine} quickstart (resource: horizon://quickstart/${engine})
3. Walk me through the setup step by step
4. Provide complete code for signup AND signin flows
5. Include token storage/caching
6. Show error handling for common issues (invalid credentials, network errors, rate limits)
7. Test the flow using horizOn MCP tools (horizon_signup_${method === "anonymous" ? "anonymous" : "email"}, horizon_signin_${method === "anonymous" ? "anonymous" : "email"})`,
          },
        },
      ],
    })
  );
}
```

**Step 3: Write debug-connection prompt**

```typescript
// src/prompts/debug-connection.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerDebugConnectionPrompt(server: McpServer): void {
  server.registerPrompt(
    "debug-connection",
    {
      title: "Debug horizOn Connection",
      description: "Diagnose and fix horizOn connection issues.",
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `My horizOn integration isn't working. Please help me debug the connection.

Steps:
1. Use the horizon_test_connection tool to check server reachability and API key validity
2. If the connection fails, diagnose the issue:
   - Is HORIZON_API_KEY set correctly?
   - Is the server URL correct (default: https://horizon.pm)?
   - Is there a network/firewall issue?
3. If the connection succeeds but features fail, check:
   - Is the user authenticated? (try horizon_check_auth)
   - Are tier limits being hit? (check the feature docs for limits)
   - Is rate limiting active? (10 requests/minute per client)
4. Provide specific fixes for any issues found`,
          },
        },
      ],
    })
  );
}
```

**Step 4: Write explain-feature prompt**

```typescript
// src/prompts/explain-feature.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

export function registerExplainFeaturePrompt(server: McpServer): void {
  server.registerPrompt(
    "explain-feature",
    {
      title: "Explain horizOn Feature",
      description: "Get a detailed explanation of any horizOn feature with examples.",
      argsSchema: z.object({
        feature: z
          .enum([
            "auth",
            "leaderboard",
            "cloud-save",
            "remote-config",
            "news",
            "gift-codes",
            "feedback",
            "user-logs",
          ])
          .describe("The feature to explain"),
      }),
    },
    ({ feature }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Explain the horizOn "${feature}" feature in detail.

Please:
1. Read the documentation (resource: horizon://docs/${feature})
2. Explain what it does and when to use it
3. Show the API endpoints and their parameters
4. Provide code examples for Godot, Unity, and REST
5. List tier limits and restrictions
6. Share best practices and common pitfalls`,
          },
        },
      ],
    })
  );
}
```

**Step 5: Create prompts/index.ts**

```typescript
// src/prompts/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerIntegrateFeaturePrompt } from "./integrate-feature.js";
import { registerSetupAuthPrompt } from "./setup-auth.js";
import { registerDebugConnectionPrompt } from "./debug-connection.js";
import { registerExplainFeaturePrompt } from "./explain-feature.js";

export function registerAllPrompts(server: McpServer): void {
  registerIntegrateFeaturePrompt(server);
  registerSetupAuthPrompt(server);
  registerDebugConnectionPrompt(server);
  registerExplainFeaturePrompt(server);
}
```

**Step 6: Wire into server.ts**

```typescript
// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "./tools/index.js";
import { registerAllResources } from "./resources/index.js";
import { registerAllPrompts } from "./prompts/index.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "horizon-mcp",
    version: "0.1.0",
  });

  registerAllResources(server);
  registerAllTools(server);
  registerAllPrompts(server);

  return server;
}
```

**Step 7: Verify compilation**

Run: `npx tsx --eval "import { createServer } from './src/server.js'; console.log('OK')"`
Expected: Prints "OK"

**Step 8: Commit**

```bash
git add src/prompts/ src/server.ts
git commit -m "feat: add prompts (integrate-feature, setup-auth, debug-connection, explain-feature)"
```

---

## Task 12: End-to-End Verification

**Files:**
- None new (verification only)

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

**Step 2: Test MCP server starts and responds**

Run:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}' | npx tsx src/index.ts
```
Expected: JSON response with `serverInfo.name: "horizon-mcp"`

**Step 3: Test tool listing**

Run:
```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | npx tsx src/index.ts
```
Expected: JSON response listing all 17+ tools

**Step 4: Test resource listing**

Run:
```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}\n{"jsonrpc":"2.0","id":2,"method":"resources/list","params":{}}\n' | npx tsx src/index.ts
```
Expected: JSON response listing all 13 resources

**Step 5: Commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: resolve issues found during E2E verification"
```

---

## Task 13: README

**Files:**
- Create: `README.md`

**Step 1: Write README.md**

Include:
1. Project name and one-line description
2. What it does (3 bullet points: Resources, Tools, Prompts)
3. Quick Install section with MCP config JSON
4. Available Tools table (name + description)
5. Available Resources table (URI + description)
6. Available Prompts table (name + description)
7. Configuration section (env vars)
8. "What is horizOn?" section (2-3 sentences + link to horizon.pm)
9. Development section (how to run locally)
10. License

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with installation and usage guide"
```

---

## Summary

| Task | Description | Files | Est. Steps |
|------|-------------|-------|-----------|
| 1 | Project scaffold | 5 | 8 |
| 2 | API client | 2 | 5 |
| 3 | Connection tool | 3 | 5 |
| 4 | Auth tools | 2 | 4 |
| 5 | Leaderboard tools | 2 | 3 |
| 6 | Cloud save tools | 2 | 3 |
| 7 | Remote config tools | 2 | 3 |
| 8 | News, gift codes, feedback, logs tools | 5 | 7 |
| 9 | Resources: overview + feature docs | 11 | 6 |
| 10 | Resources: API reference + quickstarts | 4 | 5 |
| 11 | Prompts | 6 | 8 |
| 12 | E2E verification | 0 | 5 |
| 13 | README | 1 | 2 |
| **Total** | | **45 files** | **64 steps** |
