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
   * bearer token), and the hop-by-hop / fetch-managed headers
   * `Content-Length` and `Connection`.
   */
  readonly forwardRequestHeaders?: readonly string[];
}

/**
 * Request headers that are always forwarded to the backend. In addition to
 * `Content-Type` and `Accept` these include the conditional / range headers
 * that browsers rely on for media seeking and caching.
 */
const ALWAYS_FORWARDED_HEADERS = [
  "content-type",
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
 * confuse virtual-host routing; `Authorization` is set by the proxy itself;
 * `Content-Length` and `Connection` are hop-by-hop / managed by `fetch`.
 */
const NEVER_FORWARDED_HEADERS = new Set([
  "cookie",
  "host",
  "authorization",
  "content-length",
  "connection",
]);

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
    };
    if (hasBody && req.body) {
      init.body = req.body;
      init.duplex = "half";
    }

    const response = await fetch(url.toString(), init);

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
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
