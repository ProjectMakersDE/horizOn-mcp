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

/**
 * Reads a response body as JSON. Some endpoints answer with an empty body
 * (leaderboard submit) or plain text (feedback submit), so an empty body
 * becomes null and non-JSON text is returned as a string.
 */
async function parseBody<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

/**
 * Authorization header for endpoints that need a player session
 * (leaderboard submit, cloud save, gift code redeem, player profile).
 * The token is the accessToken from sign-in.
 */
export function sessionHeaders(sessionToken: string): Record<string, string> {
  return { Authorization: `Bearer ${sessionToken}` };
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

  async get<T>(
    path: string,
    params?: Record<string, string>,
    headers?: Record<string, string>,
  ): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      if (qs) {
        url += `?${qs}`;
      }
    }

    const response = await fetch(url, {
      method: "GET",
      headers: { ...this.authHeaders(), ...headers },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new HorizonApiError(response.status, body);
    }

    return parseBody<T>(response);
  }

  /**
   * GET for endpoints that answer with raw bytes (evidence log download).
   * Returns the body bytes and the response headers; non-ok responses throw
   * HorizonApiError with the (JSON error) body as text.
   */
  async getBytes(
    path: string,
    params?: Record<string, string>,
  ): Promise<{ bytes: Uint8Array; headers: Headers }> {
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

    return { bytes: new Uint8Array(await response.arrayBuffer()), headers: response.headers };
  }

  async post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { ...this.authHeaders(), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new HorizonApiError(response.status, responseBody);
    }

    return parseBody<T>(response);
  }

  async put<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: { ...this.authHeaders(), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new HorizonApiError(response.status, responseBody);
    }

    return parseBody<T>(response);
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

    return parseBody<T>(response);
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

    return parseBody<T>(response);
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
