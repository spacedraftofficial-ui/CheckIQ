/**
 * API client.
 *
 * The access token is held in memory only — it is never written to
 * localStorage or sessionStorage, so an XSS payload cannot read it from
 * persistent storage. The refresh token lives in an httpOnly cookie that
 * JavaScript cannot read.
 */

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body?.error?.message ?? "Request failed");
    this.name = "ApiError";
    this.status = status;
    this.code = body?.error?.code ?? "UNKNOWN";
    this.details = body?.error?.details;
    this.requestId = body?.error?.requestId;
  }
}

const API_BASE = "/api";

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Set to false for endpoints that must not carry the access token. */
  auth?: boolean;
  signal?: AbortSignal;
  /** Send a raw body (used for multipart uploads). */
  raw?: boolean;
  headers?: Record<string, string>;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(options.headers ?? {}),
  };

  if (accessToken && options.auth !== false) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (options.raw) {
      body = options.body as BodyInit;
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers,
    body,
    credentials: "same-origin",
    signal: options.signal,
  });

  const text = await response.text();
  const payload = text ? safeParse(text) : null;

  if (!response.ok) {
    throw new ApiError(response.status, (payload ?? { error: { code: "UNKNOWN", message: response.statusText } }) as ApiErrorBody);
  }

  return (payload as { data: T })?.data ?? (payload as T);
}

/** Returns the full envelope, including pagination metadata. */
export async function requestPage<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }> {
  const headers: Record<string, string> = { Accept: "application/json", ...(options.headers ?? {}) };
  if (accessToken && options.auth !== false) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    credentials: "same-origin",
    signal: options.signal,
  });

  const text = await response.text();
  const payload = text ? safeParse(text) : null;
  if (!response.ok) {
    throw new ApiError(response.status, (payload ?? { error: { code: "UNKNOWN", message: response.statusText } }) as ApiErrorBody);
  }
  return payload as { data: T[]; meta: { page: number; pageSize: number; total: number; totalPages: number } };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Builds a query string from a plain object, skipping empty values. */
export function toQueryString(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const entry of value) search.append(key, String(entry));
    } else {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

/** Fetches a binary blob with auth headers — used for document downloads/views. */
export async function apiBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers,
    credentials: "same-origin",
  });
  if (!response.ok) {
    const text = await response.text();
    const payload = safeParse(text);
    throw new ApiError(
      response.status,
      (payload as ApiErrorBody | null) ?? {
        error: { code: "UNKNOWN", message: response.statusText },
      },
    );
  }
  return await response.blob();
}
