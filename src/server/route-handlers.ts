import { NextRequest, NextResponse } from "next/server";
import type { Session } from "next-auth";

type AuthFn = () => Promise<Session | null>;

type RouteHandler = (
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) => Promise<Response>;

export interface BackendProxyConfig {
  readonly backendUrl: string;
  readonly auth: AuthFn;
  /**
   * Additional request headers to forward to the backend, matched
   * case-insensitively (e.g. `["Idempotency-Key", "X-Checksum-Sha256"]`).
   *
   * Security-sensitive headers are always excluded regardless of this
   * list: `Cookie`, `Host`, `Authorization` (the proxy sets its own
   * bearer token) and the hop-by-hop header `Connection`.
   */
  readonly forwardRequestHeaders?: readonly string[];
}

/**
 * Request headers that are always forwarded to the backend. Besides
 * `Content-Type` and `Accept` these are the conditional / range headers that
 * browsers rely on for media seeking and caching, plus `Content-Length`.
 *
 * `Content-Length` matters because the body is *streamed*: without it `fetch`
 * frames the upstream request with `Transfer-Encoding: chunked`, and a backend
 * asking for the declared length (e.g. Servlet `getContentLengthLong()`) then
 * gets `-1`. Backends use that value to reject an over-sized upload before
 * reading a single byte, so dropping the header silently disables the check
 * and turns a cheap rejection into a full transfer. The body is passed through
 * byte for byte, so the incoming length stays accurate.
 */
const ALWAYS_FORWARDED_HEADERS = [
  "content-type",
  "content-length",
  "accept",
  "range",
  "if-range",
  "if-none-match",
  "if-match",
  "if-modified-since",
  "if-unmodified-since",
] as const;

/**
 * Headers that must never be forwarded to the backend, even when listed in
 * `forwardRequestHeaders`. `Cookie` and `Host` would leak session state and
 * confuse virtual-host routing, `Authorization` is set by the proxy itself,
 * and `Connection` is hop-by-hop.
 */
const NEVER_FORWARDED_HEADERS = new Set(["cookie", "host", "authorization", "connection"]);

/**
 * Hop-by-hop response headers (RFC 9110 7.6.1). They describe the *upstream*
 * connection, not the response, and must not be relayed to the client: a
 * relayed `Transfer-Encoding: chunked` contradicts the framing Next.js applies
 * to the response it actually sends.
 */
const HOP_BY_HOP_RESPONSE_HEADERS = [
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
  "proxy-authenticate",
  "proxy-authorization",
];

/**
 * The upstream response headers, corrected for what `fetch` did to the body.
 *
 * Node's `fetch` adds `Accept-Encoding: gzip, deflate` on its own and
 * transparently *decodes* a compressed response, but leaves `Content-Encoding`
 * and `Content-Length` describing the encoded bytes. Relaying them hands the
 * client plain bytes labelled `gzip` and a length that does not match, which
 * browsers report as `ERR_CONTENT_DECODING_FAILED`. Both are therefore dropped
 * whenever the upstream response was encoded — and only then, so an
 * uncompressed `206 Partial Content` keeps its `Content-Length`.
 *
 * Everything that describes the resource — `ETag`, `Accept-Ranges`,
 * `Content-Range`, `Cache-Control`, `Content-Type`, `Content-Disposition` — is
 * preserved untouched.
 */
function relayedResponseHeaders(upstream: Headers): Headers {
  const headers = new Headers(upstream);
  for (const name of HOP_BY_HOP_RESPONSE_HEADERS) {
    headers.delete(name);
  }
  if (headers.has("content-encoding")) {
    headers.delete("content-encoding");
    headers.delete("content-length");
  }
  return headers;
}

/**
 * Create a route handler that proxies an authenticated request to the
 * upstream backend, attaching `Authorization: Bearer <accessToken>` from
 * the session cookie and forwarding query params, the (streamed) request
 * body, and a curated set of request headers.
 *
 * The body is streamed rather than buffered, so arbitrarily large uploads
 * pass through with constant memory use. Range and conditional headers are
 * forwarded so that media seeking (`206 Partial Content`) and caching work.
 * Extra application headers can be allow-listed via `forwardRequestHeaders`.
 *
 * Mount as `export { handler as GET, handler as POST, handler as PUT, handler as DELETE }`
 * in `frontend/src/app/api/[...path]/route.ts`.
 */
export function createBackendProxyHandler(config: BackendProxyConfig): RouteHandler {
  const { backendUrl, auth, forwardRequestHeaders = [] } = config;
  const extraForwarded = new Set(
    forwardRequestHeaders
      .map((name) => name.toLowerCase())
      .filter((name) => !NEVER_FORWARDED_HEADERS.has(name)),
  );
  const forwarded = new Set<string>([...ALWAYS_FORWARDED_HEADERS, ...extraForwarded]);

  return async function handler(req, { params }) {
    const session = await auth();
    const { path } = await params;
    const target = `${backendUrl}/api/${path.join("/")}`;

    const url = new URL(target);
    const reqUrl = new URL(req.url);
    reqUrl.searchParams.forEach((value, key) => {
      url.searchParams.append(key, value);
    });

    const headers = new Headers();
    req.headers.forEach((value, key) => {
      if (forwarded.has(key.toLowerCase())) headers.set(key, value);
    });
    if (session?.accessToken) {
      headers.set("Authorization", `Bearer ${session.accessToken}`);
    }

    const hasBody = req.method !== "GET" && req.method !== "HEAD";

    // Stream the body instead of buffering it into memory. `duplex: "half"`
    // is required by undici (Node's fetch) whenever a ReadableStream body is
    // sent; it is not yet in the DOM `RequestInit` type, hence the cast.
    const init: RequestInit & { duplex?: "half" } = {
      method: req.method,
      headers,
      // A streamed body is single-use and cannot be replayed, so following a
      // 307/308 — which must repeat the request with the same method and body —
      // would fail after the stream has been consumed. Relay the 3xx and its
      // `Location` to the client instead and let it decide. Unlike the browser
      // Fetch spec, undici returns the real response here, not an opaque
      // redirect with status 0.
      redirect: "manual",
      // Propagate cancellation: when the client aborts an upload, abort the
      // upstream request too, so the backend stops reading and can roll back
      // its partial write instead of draining a connection nobody is on.
      signal: req.signal,
    };
    if (hasBody && req.body) {
      init.body = req.body;
      init.duplex = "half";
    }

    const response = await fetch(url.toString(), init);

    return new Response(response.body, {
      status: response.status,
      headers: relayedResponseHeaders(response.headers),
    });
  };
}

export interface LogoutHandlerConfig {
  readonly auth: AuthFn;
  readonly oidcIssuer: string | undefined;
  readonly authUrl: string;
}

const SESSION_COOKIE_PREFIXES = ["authjs.session-token", "__Secure-authjs.session-token"];

/**
 * Create a route handler that performs an OIDC end-session flow and
 * deletes all Auth.js session cookies (including chunked variants).
 *
 * Mount as `export { handler as GET }` in `frontend/src/app/api/logout/route.ts`.
 */
export function createLogoutHandler(config: LogoutHandlerConfig) {
  const { auth, oidcIssuer, authUrl } = config;
  return async function handler(req: NextRequest): Promise<Response> {
    const session = await auth();
    const idToken = session?.idToken;

    const loginUrl = `${authUrl}/login`;
    let endSessionUrl = loginUrl;
    if (oidcIssuer) {
      try {
        const wellKnownResponse = await fetch(`${oidcIssuer}/.well-known/openid-configuration`);
        const wellKnown = await wellKnownResponse.json();
        const endSessionEndpoint = wellKnown.end_session_endpoint;
        if (endSessionEndpoint) {
          const params = new URLSearchParams();
          if (idToken) params.set("id_token_hint", idToken);
          params.set("post_logout_redirect_uri", loginUrl);
          endSessionUrl = `${endSessionEndpoint}?${params.toString()}`;
        }
      } catch {
        // Fall back to /login if discovery fails
      }
    }

    const response = NextResponse.redirect(endSessionUrl);

    const isSecure = authUrl.startsWith("https://");
    const cookieOptions = {
      path: "/",
      secure: isSecure,
      httpOnly: true,
      sameSite: "lax" as const,
    };

    for (const prefix of SESSION_COOKIE_PREFIXES) {
      response.cookies.delete({ name: prefix, ...cookieOptions });
      for (const cookie of req.cookies.getAll()) {
        if (cookie.name.startsWith(`${prefix}.`)) {
          response.cookies.delete({ name: cookie.name, ...cookieOptions });
        }
      }
    }

    return response;
  };
}
