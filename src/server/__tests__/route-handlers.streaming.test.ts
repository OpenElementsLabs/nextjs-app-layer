// @vitest-environment node
//
// Integration tests for the backend proxy against a real HTTP server and the
// real `fetch` of the runtime. The sibling suite mocks `fetch` and can only
// assert the *shape* of what the handler passes in — it cannot show that bytes
// actually move before the request body ends, nor what `fetch` does to an
// encoded response body. Both are properties of undici, so they need undici.
//
// This is the canary for a Node or Next upgrade breaking `duplex: "half"`.
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import http from "node:http";
import { gzipSync } from "node:zlib";
import type { AddressInfo } from "node:net";
import type { NextRequest } from "next/server";
import { createBackendProxyHandler } from "../route-handlers";

interface Received {
  readonly method: string;
  readonly url: string;
  readonly headers: http.IncomingHttpHeaders;
}

let server: http.Server;
let backendUrl: string;
/** Resolves as soon as the upstream server has seen the first body chunk. */
let firstChunkSeen: Promise<void>;
let announceFirstChunk: () => void;
let received: Received | undefined;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    received = { method: req.method!, url: req.url!, headers: req.headers };

    if (req.url?.startsWith("/api/gzip")) {
      const body = gzipSync(JSON.stringify({ hello: "world" }));
      res.writeHead(200, {
        "content-type": "application/json",
        "content-encoding": "gzip",
        "content-length": String(body.length),
        etag: '"v1"',
      });
      return res.end(body);
    }

    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      announceFirstChunk();
    });
    req.on("end", () => {
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ received: total }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  backendUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** A request whose body is a stream, as Next.js hands it to a route handler. */
function streamingRequest(
  url: string,
  body: ReadableStream<Uint8Array>,
  headers: Record<string, string>,
): NextRequest {
  return new Request(url, {
    method: "PUT",
    headers,
    body,
    duplex: "half",
  } as RequestInit & { duplex: "half" }) as unknown as NextRequest;
}

function context(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

/** The request the upstream server last saw; fails loudly if there was none. */
function lastUpstreamRequest(): Received {
  if (!received) {
    throw new Error("the upstream server recorded no request");
  }
  return received;
}

describe("createBackendProxyHandler (real fetch)", () => {
  it("should deliver body chunks upstream before the request body is closed", async () => {
    received = undefined;
    firstChunkSeen = new Promise<void>((resolve) => {
      announceFirstChunk = resolve;
    });

    // The stream deliberately withholds its second chunk until the upstream
    // server has confirmed the first one. A handler that buffers the body
    // waits for a stream that is waiting for the handler: nothing arrives, and
    // the assertion below fails on the timeout instead of hanging silently.
    const chunk = new Uint8Array(8);
    let emitted = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (emitted === 0) {
          emitted++;
          return controller.enqueue(chunk);
        }
        if (emitted === 1) {
          const streamed = await Promise.race([
            firstChunkSeen.then(() => true),
            new Promise<false>((resolve) => setTimeout(() => resolve(false), 2_000)),
          ]);
          expect(streamed).toBe(true);
          emitted++;
          return controller.enqueue(chunk);
        }
        controller.close();
      },
    });

    const handler = createBackendProxyHandler({ backendUrl, auth: async () => null });
    const res = await handler(
      streamingRequest(
        "http://app.test/api/upload",
        stream,
        { "content-type": "audio/webm" }, // no content-length: length is unknown up front
      ),
      context(["upload"]),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ received: 16 });
  });

  it("should forward a declared Content-Length to the backend for a streamed body", async () => {
    received = undefined;
    firstChunkSeen = new Promise<void>((resolve) => {
      announceFirstChunk = resolve;
    });

    const payload = new Uint8Array(24);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(payload);
        controller.close();
      },
    });

    const handler = createBackendProxyHandler({ backendUrl, auth: async () => null });
    const res = await handler(
      streamingRequest("http://app.test/api/upload", stream, {
        "content-type": "audio/webm",
        "content-length": "24",
      }),
      context(["upload"]),
    );

    expect(res.status).toBe(201);
    // The declared length reached the backend rather than being replaced by
    // `Transfer-Encoding: chunked` — this is what lets a backend reject an
    // over-sized upload before reading the body.
    expect(lastUpstreamRequest().headers["content-length"]).toBe("24");
    expect(lastUpstreamRequest().headers["transfer-encoding"]).toBeUndefined();
  });

  it("should relay a gzip-encoded response as decoded bytes without contradicting headers", async () => {
    const handler = createBackendProxyHandler({ backendUrl, auth: async () => null });
    const res = await handler(
      new Request("http://app.test/api/gzip") as unknown as NextRequest,
      context(["gzip"]),
    );

    expect(res.status).toBe(200);
    // `fetch` decoded the body, so the encoding headers must not survive.
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(res.headers.get("content-length")).toBeNull();
    expect(res.headers.get("etag")).toBe('"v1"');
    expect(await res.json()).toEqual({ hello: "world" });
  });

  it("should not relay hop-by-hop headers from a chunked upstream response", async () => {
    const handler = createBackendProxyHandler({ backendUrl, auth: async () => null });
    const res = await handler(
      new Request("http://app.test/api/gzip") as unknown as NextRequest,
      context(["gzip"]),
    );

    expect(res.headers.get("connection")).toBeNull();
    expect(res.headers.get("keep-alive")).toBeNull();
    expect(res.headers.get("transfer-encoding")).toBeNull();
  });
});
