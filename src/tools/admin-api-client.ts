/**
 * Admin API client factory.
 *
 * Uses HORIZON_ACCOUNT_API_KEY (account-level API key) and sends it as
 * X-Account-API-Key so the backend routes the request to the
 * AccountApiKeyAuthenticationFilter.
 *
 * Returns null when HORIZON_ACCOUNT_API_KEY is unset, so callers can
 * skip admin-tool registration entirely.
 */

import { HorizonApiClient } from "./api-client.js";

export function createAdminApiClientFromEnv(): HorizonApiClient | null {
  const accountApiKey = process.env.HORIZON_ACCOUNT_API_KEY;
  if (!accountApiKey) {
    return null;
  }
  const baseUrl = process.env.HORIZON_BASE_URL ?? "https://horizon.pm";
  return new HorizonApiClient(accountApiKey, baseUrl, "X-Account-API-Key");
}
