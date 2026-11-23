import { describe, it, expect } from "vitest";
import type { NextAuthResult } from "next-auth";
import {
  type AppLayerPublicRoutes,
  type ResolvedPublicRoutes,
  createAppLayerProxy,
  handleProxyRequest,
  isPublicRoute,
  resolvePublicRoutes,
} from "../proxy.js";

const ORIGIN = "http://localhost:3000";

const AUTHORIZED_SESSION = { user: { name: "John Doe" } };
const REFRESH_ERROR_SESSION = { user: { name: "John Doe" }, error: "RefreshTokenError" };

function routesFor(publicRoutes?: AppLayerPublicRoutes): ResolvedPublicRoutes {
  return resolvePublicRoutes(publicRoutes);
}

function requestTo(
  path: string,
  session: { user?: unknown; error?: unknown } | null | undefined = null,
  publicRoutes?: AppLayerPublicRoutes,
) {
  return handleProxyRequest(new URL(path, ORIGIN), session, routesFor(publicRoutes));
}

/** `NextResponse.next()` passes the request on; only a redirect carries a Location. */
function isPassThrough(response: Response): boolean {
  return response.headers.get("location") === null;
}

function redirectTarget(response: Response): URL {
  const location = response.headers.get("location");
  if (location === null) {
    throw new Error("expected a redirect, but the response carries no Location header");
  }
  return new URL(location);
}

describe("built-in public routes", () => {
  it("lets an unauthenticated request reach the login page", () => {
    expect(isPassThrough(requestTo("/login"))).toBe(true);
  });

  it("lets an unauthenticated request reach the Auth.js callback", () => {
    expect(isPassThrough(requestTo("/api/auth/callback/oidc"))).toBe(true);
  });

  it("lets an unauthenticated request reach the logout route", () => {
    expect(isPassThrough(requestTo("/api/logout"))).toBe(true);
  });

  it("matches built-in public routes by prefix", () => {
    expect(isPassThrough(requestTo("/api/auth/session"))).toBe(true);
  });

  it("still protects a path that merely starts with the same characters", () => {
    expect(isPassThrough(requestTo("/loginsomething"))).toBe(false);
  });
});

describe("configured public routes — exact", () => {
  const publicRoutes: AppLayerPublicRoutes = { exact: ["/offline"] };

  it("matches its own path", () => {
    expect(isPassThrough(requestTo("/offline", null, publicRoutes))).toBe(true);
  });

  it("does not match a sub-path", () => {
    expect(isPassThrough(requestTo("/offline/details", null, publicRoutes))).toBe(false);
  });

  it("matches a file-like path", () => {
    const files: AppLayerPublicRoutes = { exact: ["/sw.js", "/manifest.webmanifest"] };
    expect(isPassThrough(requestTo("/sw.js", null, files))).toBe(true);
    expect(isPassThrough(requestTo("/manifest.webmanifest", null, files))).toBe(true);
  });
});

describe("configured public routes — prefix", () => {
  const publicRoutes: AppLayerPublicRoutes = { prefix: ["/record-e2e"] };

  it("matches its own path", () => {
    expect(isPassThrough(requestTo("/record-e2e", null, publicRoutes))).toBe(true);
  });

  it("matches a sub-path", () => {
    expect(isPassThrough(requestTo("/record-e2e/step/2", null, publicRoutes))).toBe(true);
  });

  it("respects the path-segment boundary", () => {
    expect(isPassThrough(requestTo("/recordings", null, { prefix: ["/record"] }))).toBe(false);
  });

  it("tolerates a trailing slash in the configured prefix", () => {
    expect(isPassThrough(requestTo("/record-e2e/step/2", null, { prefix: ["/record-e2e/"] }))).toBe(
      true,
    );
  });

  it("matches a requested path that carries a trailing slash", () => {
    expect(isPassThrough(requestTo("/record-e2e/", null, publicRoutes))).toBe(true);
  });

  it("combines exact and prefix entries", () => {
    const combined: AppLayerPublicRoutes = { exact: ["/offline"], prefix: ["/record-e2e"] };
    expect(isPassThrough(requestTo("/offline", null, combined))).toBe(true);
    expect(isPassThrough(requestTo("/record-e2e/x", null, combined))).toBe(true);
    expect(isPassThrough(requestTo("/offline/x", null, combined))).toBe(false);
  });
});

describe("protected routes", () => {
  it("redirects an unauthenticated request to the login page", () => {
    const response = requestTo("/admin/users");
    expect(isPassThrough(response)).toBe(false);
    expect(redirectTarget(response).pathname).toBe("/login");
  });

  it("carries the originally requested path as callbackUrl", () => {
    const target = redirectTarget(requestTo("/admin/users"));
    expect(target.searchParams.get("callbackUrl")).toBe("/admin/users");
  });

  it("preserves the query string in callbackUrl", () => {
    const target = redirectTarget(requestTo("/admin/users?page=3"));
    expect(target.searchParams.get("callbackUrl")).toBe("/admin/users?page=3");
  });

  it("keeps callbackUrl relative, so it cannot become an open redirect", () => {
    const callbackUrl = redirectTarget(requestTo("/admin/users")).searchParams.get("callbackUrl");
    expect(callbackUrl?.startsWith("/")).toBe(true);
    expect(callbackUrl).not.toMatch(/^https?:\/\//);
    expect(callbackUrl).not.toMatch(/^\/\//);
  });

  it("lets an authenticated request through", () => {
    expect(isPassThrough(requestTo("/admin/users", AUTHORIZED_SESSION))).toBe(true);
  });

  it("protects an unknown path rather than treating it as public", () => {
    expect(isPassThrough(requestTo("/this/route/does/not/exist"))).toBe(false);
  });

  it("redirects an unauthenticated request to the root", () => {
    const response = requestTo("/");
    expect(isPassThrough(response)).toBe(false);
    expect(redirectTarget(response).pathname).toBe("/login");
  });
});

describe("session error states", () => {
  it("treats a refresh-token error as unauthenticated", () => {
    expect(isPassThrough(requestTo("/admin/users", REFRESH_ERROR_SESSION))).toBe(false);
  });

  it("treats a session without a user as unauthenticated", () => {
    expect(isPassThrough(requestTo("/admin/users", {}))).toBe(false);
  });

  it("keeps the login page reachable with a broken session, avoiding a redirect loop", () => {
    expect(isPassThrough(requestTo("/login", REFRESH_ERROR_SESSION))).toBe(true);
  });
});

describe("configuration validation", () => {
  it("rejects a route without a leading slash and names it", () => {
    expect(() => resolvePublicRoutes({ exact: ["offline"] })).toThrow(/"offline"/);
    expect(() => resolvePublicRoutes({ prefix: ["record-e2e"] })).toThrow(/"record-e2e"/);
  });

  it("rejects a bare slash as a prefix entry", () => {
    expect(() => resolvePublicRoutes({ prefix: ["/"] })).toThrow(/every route public/);
  });

  it("accepts a bare slash as an exact entry, exposing only the root", () => {
    expect(() => resolvePublicRoutes({ exact: ["/"] })).not.toThrow();
    expect(isPassThrough(requestTo("/", null, { exact: ["/"] }))).toBe(true);
    expect(isPassThrough(requestTo("/admin", null, { exact: ["/"] }))).toBe(false);
  });

  it("treats omitted options as 'only the built-in routes are public'", () => {
    const routes = resolvePublicRoutes();
    expect(isPublicRoute("/login", routes)).toBe(true);
    expect(isPublicRoute("/admin/users", routes)).toBe(false);
  });

  it("treats an empty publicRoutes object like omitting the option", () => {
    expect(resolvePublicRoutes({})).toEqual(resolvePublicRoutes());
  });
});

/**
 * A stub for next-auth's `auth`, standing in for its middleware overload: it
 * hands the request straight to the handler it was given. Enough to exercise the
 * factory's wiring without constructing a NextAuth instance.
 */
const passThroughAuth = ((handler: unknown) => handler) as unknown as NextAuthResult["auth"];

type FakeRequest = { url: string; auth: { user?: unknown; error?: unknown } | null };

async function callProxy(
  proxy: ReturnType<typeof createAppLayerProxy>,
  request: FakeRequest,
): Promise<Response> {
  const response = await (proxy as unknown as (req: FakeRequest) => Promise<Response> | Response)(
    request,
  );
  return response;
}

describe("createAppLayerProxy", () => {
  it("validates its options when it is called, not on the first request", () => {
    expect(() => createAppLayerProxy(passThroughAuth, { publicRoutes: { prefix: ["/"] } })).toThrow(
      /every route public/,
    );
    expect(() =>
      createAppLayerProxy(passThroughAuth, { publicRoutes: { exact: ["bad"] } }),
    ).toThrow(/"bad"/);
  });

  it("builds a proxy when no options are given", () => {
    expect(() => createAppLayerProxy(passThroughAuth)).not.toThrow();
  });

  it("reads the pathname from the request URL", async () => {
    const proxy = createAppLayerProxy(passThroughAuth, { publicRoutes: { exact: ["/offline"] } });
    const response = await callProxy(proxy, { url: `${ORIGIN}/offline`, auth: null });
    expect(isPassThrough(response)).toBe(true);
  });

  it("reads the session from the request and redirects when it is absent", async () => {
    const proxy = createAppLayerProxy(passThroughAuth);
    const response = await callProxy(proxy, { url: `${ORIGIN}/admin/users?page=3`, auth: null });
    expect(redirectTarget(response).searchParams.get("callbackUrl")).toBe("/admin/users?page=3");
  });

  it("reads the session from the request and passes an authenticated one through", async () => {
    const proxy = createAppLayerProxy(passThroughAuth);
    const response = await callProxy(proxy, {
      url: `${ORIGIN}/admin/users`,
      auth: AUTHORIZED_SESSION,
    });
    expect(isPassThrough(response)).toBe(true);
  });
});
