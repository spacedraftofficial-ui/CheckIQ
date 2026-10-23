import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ApiError, request, setAccessToken, toQueryString } from "../lib/api";

/**
 * The API client is the only place the browser talks to the server. These
 * tests pin the error contract and the token handling.
 */
describe("api client", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    setAccessToken(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("unwraps the data envelope", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ data: { id: "case-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ) as typeof fetch;

    const result = await request<{ id: string }>("/cases/case-1");
    expect(result).toEqual({ id: "case-1" });
  });

  it("surfaces the error code, message and details from the server", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "CANDIDATE_ID_ALREADY_IN_USE",
            message: "This Candidate ID is already registered.",
            details: { canSignIn: true },
            requestId: "req-1",
          },
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      ),
    ) as typeof fetch;

    await expect(request("/auth/signup", { method: "POST", body: {} })).rejects.toThrowError(
      ApiError,
    );

    try {
      await request("/auth/signup", { method: "POST", body: {} });
    } catch (error) {
      const apiError = error as ApiError;
      expect(apiError.status).toBe(409);
      expect(apiError.code).toBe("CANDIDATE_ID_ALREADY_IN_USE");
      expect(apiError.message).toBe("This Candidate ID is already registered.");
      expect(apiError.details).toEqual({ canSignIn: true });
      expect(apiError.requestId).toBe("req-1");
    }
  });

  it("sends the access token as a bearer token", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    setAccessToken("token-123");
    await request("/dashboard");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token-123");
  });

  it("omits the access token when the endpoint is public", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    setAccessToken("token-123");
    await request("/auth/login", { method: "POST", body: {}, auth: false });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("builds query strings, skipping empty values", () => {
    expect(
      toQueryString({ search: "Asha", status: "", page: 2, missing: undefined }),
    ).toBe("?search=Asha&page=2");
  });

  it("repeats an array parameter", () => {
    expect(toQueryString({ status: ["SUBMITTED", "VERIFICATION_IN_PROGRESS"] })).toBe(
      "?status=SUBMITTED&status=VERIFICATION_IN_PROGRESS",
    );
  });
});
