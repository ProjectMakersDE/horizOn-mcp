import { describe, it, expect } from "vitest";
import { createAdminApiClientFromEnv } from "../admin-api-client.js";

const hasEnv = !!process.env.HORIZON_ACCOUNT_API_KEY;

describe.skipIf(!hasEnv)("admin api e2e", () => {
  it("GET /admin/api-keys with keyType=PROJECT returns successfully", async () => {
    const client = createAdminApiClientFromEnv()!;
    const result = await client.get("/api/v1/admin/api-keys", {
      keyType: "PROJECT",
      size: "1",
    });
    expect(result).toBeDefined();
  });

  it("GET /admin/user-management/statistics returns stats shape", async () => {
    const client = createAdminApiClientFromEnv()!;
    const result = (await client.get(
      "/api/v1/admin/user-management/statistics",
    )) as any;
    expect(result).toHaveProperty("totalUsers");
  });
});
