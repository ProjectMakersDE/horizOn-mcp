/**
 * HTTP API client for the horizOn App API.
 *
 * All requests include an API-key header (default: X-API-Key) and
 * Content-Type: application/json. The header name is configurable so the
 * same client can be used for account-level keys (X-Account-API-Key).
 *
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
  private readonly headerName: string;

  constructor(apiKey: string, baseUrl: string, headerName: string = "X-API-Key") {
    if (!apiKey) {
      throw new Error("API key must not be empty");
    }
    this.apiKey = apiKey;
    // Strip trailing slash so path concatenation is predictable
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.headerName = headerName;
  }

  private authHeaders(): Record<string, string> {
    return {
      [this.headerName]: this.apiKey,
      "Content-Type": "application/json",
    };
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
      headers: this.authHeaders(),
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
      headers: this.authHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new HorizonApiError(response.status, responseBody);
    }

    return (await response.json()) as T;
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: this.authHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new HorizonApiError(response.status, responseBody);
    }

    return (await response.json()) as T;
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "PATCH",
      headers: this.authHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new HorizonApiError(response.status, responseBody);
    }

    return (await response.json()) as T;
  }

  async delete<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: this.authHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
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
