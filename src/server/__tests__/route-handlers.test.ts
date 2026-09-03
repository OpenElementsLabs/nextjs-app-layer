import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Session } from "next-auth";
import type { NextRequest } from "next/server";
import { createBackendProxyHandler } from "../route-handlers";

const BACKEND_URL = "http://backend.test";

/** Build a session whose access token is attached as a bearer token. */
function sessionWithToken(accessToken: string): Session {
  return { accessToken, expires: "" } as unknown as Session;
}

/**
 * Construct a request the handler can consume. A plain `Request` exposes the
 * same `method` / `headers` / `body` / `url` surface the handler reads, so we
 * cast it to `NextRequest` instead of pulling in the Next.js runtime.
 */
function makeRequest(
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: BodyInit },
): NextRequest {
  return new Request(url, init) as unknown as NextRequest;
}

/** The `{ params }` context the App Router passes as the second argument. */
function context(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

/** Capture the URL and init of the single upstream fetch a handler performs. */
function mockFetch(response: Response) {
  return vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async () => response,
  );
}

describe("createBackendProxyHandler", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("should target the backend /api path and forward query params", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const handler = createBackendProxyHandler({
      backendUrl: BACKEND_URL,
      auth: async () => null,
    });
    await handler(makeRequest("http://app.test/api/files?limit=5&sort=name"), context(["files"]));

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.origin + calledUrl.pathname).toBe(`${BACKEND_URL}/api/files`);
    expect(calledUrl.searchParams.get("limit")).toBe("5");
    expect(calledUrl.searchParams.get("sort")).toBe("name");
  });

  it("should attach the session access token as a bearer Authorization header", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const handler = createBackendProxyHandler({
      backendUrl: BACKEND_URL,
      auth: async () => sessionWithToken("tok-123"),
    });
    await handler(makeRequest("http://app.test/api/me"), context(["me"]));

    const headers = (fetchMock.mock.calls[0][1]! as RequestInit).headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer tok-123");
  });

  it("should stream the request body without buffering and set duplex for undici", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 201 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const handler = createBackendProxyHandler({
      backendUrl: BACKEND_URL,
      auth: async () => null,
    });
    const req = makeRequest("http://app.test/api/upload", { method: "POST", body: "payload" });
    await handler(req, context(["upload"]));

    const init = fetchMock.mock.calls[0][1]! as RequestInit & { duplex?: string };
    expect(init.duplex).toBe("half");
    expect(init.body).toBeInstanceOf(ReadableStream);
    // The handler must not consume the body itself (no buffering).
    expect(req.bodyUsed).toBe(false);
  });

  it("should not set a body or duplex for GET requests", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const handler = createBackendProxyHandler({
      backendUrl: BACKEND_URL,
      auth: async () => null,
    });
    await handler(makeRequest("http://app.test/api/files"), context(["files"]));

    const init = fetchMock.mock.calls[0][1]! as RequestInit & { duplex?: string };
    expect(init.body).toBeUndefined();
    expect(init.duplex).toBeUndefined();
  });

  it("should forward Range and conditional headers for media seeking", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 206 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const handler = createBackendProxyHandler({
      backendUrl: BACKEND_URL,
      auth: async () => null,
    });
    await handler(
      makeRequest("http://app.test/api/audio.mp3", {
        headers: {
          Range: "bytes=200-1000",
          "If-Range": '"etag-1"',
          "If-None-Match": '"etag-2"',
          "If-Modified-Since": "Wed, 21 Oct 2015 07:28:00 GMT",
        },
      }),
      context(["audio.mp3"]),
    );

    const headers = (fetchMock.mock.calls[0][1]! as RequestInit).headers as Headers;
    expect(headers.get("Range")).toBe("bytes=200-1000");
    expect(headers.get("If-Range")).toBe('"etag-1"');
    expect(headers.get("If-None-Match")).toBe('"etag-2"');
    expect(headers.get("If-Modified-Since")).toBe("Wed, 21 Oct 2015 07:28:00 GMT");
  });

  it("should pass through the upstream 206 Partial Content status and body", async () => {
    const fetchMock = mockFetch(new Response("chunk", { status: 206 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const handler = createBackendProxyHandler({
      backendUrl: BACKEND_URL,
      auth: async () => null,
    });
    const res = await handler(
      makeRequest("http://app.test/api/audio.mp3", { headers: { Range: "bytes=0-4" } }),
      context(["audio.mp3"]),
    );

    expect(res.status).toBe(206);
    expect(await res.text()).toBe("chunk");
  });

  it("should forward allow-listed custom headers case-insensitively", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const handler = createBackendProxyHandler({
      backendUrl: BACKEND_URL,
      auth: async () => null,
      forwardRequestHeaders: ["Idempotency-Key", "X-Checksum-Sha256"],
    });
    await handler(
      makeRequest("http://app.test/api/upload", {
        method: "POST",
        headers: { "idempotency-key": "abc", "X-Checksum-Sha256": "deadbeef" },
      }),
      context(["upload"]),
    );

    const headers = (fetchMock.mock.calls[0][1]! as RequestInit).headers as Headers;
    expect(headers.get("Idempotency-Key")).toBe("abc");
    expect(headers.get("X-Checksum-Sha256")).toBe("deadbeef");
  });

  it("should not forward the Cookie header even when explicitly allow-listed", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const handler = createBackendProxyHandler({
      backendUrl: BACKEND_URL,
      auth: async () => null,
      forwardRequestHeaders: ["Cookie", "Host"],
    });
    await handler(
      makeRequest("http://app.test/api/me", {
        headers: { Cookie: "session=secret", Host: "evil.test" },
      }),
      context(["me"]),
    );

    const headers = (fetchMock.mock.calls[0][1]! as RequestInit).headers as Headers;
    expect(headers.get("Cookie")).toBeNull();
    expect(headers.get("Host")).toBeNull();
  });

  it("should ignore a client-supplied Authorization header and use the session token", async () => {
    const fetchMock = mockFetch(new Response(null, { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const handler = createBackendProxyHandler({
      backendUrl: BACKEND_URL,
      auth: async () => sessionWithToken("real-token"),
      forwardRequestHeaders: ["Authorization"],
    });
    await handler(
      makeRequest("http://app.test/api/me", { headers: { Authorization: "Bearer spoofed" } }),
      context(["me"]),
    );

    const headers = (fetchMock.mock.calls[0][1]! as RequestInit).headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer real-token");
  });
});
