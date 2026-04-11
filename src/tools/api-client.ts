/**
 * HTTP API client for the horizOn App API.
 *
 * All requests include the X-API-Key header and Content-Type: application/json.
 * Non-ok responses throw HorizonApiError with the HTTP status and body.
 */

export class HorizonApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
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
      throw new Error("API key must not be empty");
    }
    this.apiKey = apiKey;
    // Strip trailing slash so path concatenation is predictable
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) {
        url += `?${qs}`;
      }
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new HorizonApiError(response.status, body);
    }

    return (await response.json()) as T;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new HorizonApiError(response.status, responseBody);
    }

    return (await response.json()) as T;
  }

  async delete<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: {
        "X-API-Key": this.apiKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new HorizonApiError(response.status, responseBody);
    }

    return (await response.json()) as T;
  }
}

/**
 * Creates an API client from environment variables.
 * Returns null if HORIZON_API_KEY is not set.
 * Uses HORIZON_BASE_URL or defaults to "https://horizon.pm".
 */
export function createApiClientFromEnv(): HorizonApiClient | null {
  const apiKey = process.env.HORIZON_API_KEY;
  if (!apiKey) {
    return null;
  }
  const baseUrl = process.env.HORIZON_BASE_URL || "https://horizon.pm";
  return new HorizonApiClient(apiKey, baseUrl);
}
