import { NextResponse } from "next/server";
import type { NextFetchEvent, NextMiddleware } from "next/server";
import type { NextAuthRequest, NextAuthResult } from "next-auth";
import { isAuthorized } from "./oidc-tokens.js";

/**
 * Routes the auth flow itself needs in order to work at all: the Auth.js
 * handler, the OIDC end-session route and the public login page.
 *
 * These are prefixes, always applied, and deliberately not configurable —
 * making them configurable would only let an app lock itself out of its own
 * login.
 */
const BUILT_IN_PUBLIC_PREFIXES: readonly string[] = ["/api/auth", "/api/logout", "/login"];

/**
 * Paths an app wants reachable without a session, on top of the built-in ones.
 *
 * Both forms exist because real apps need both: a route group with sub-pages
 * wants `prefix`, while a single resource such as `/sw.js` or
 * `/manifest.webmanifest` wants `exact`, where a prefix match would be
 * needlessly broad.
 */
export interface AppLayerPublicRoutes {
  /** Public when the request pathname equals the entry exactly. */
  readonly exact?: readonly string[];
  /** Public when the pathname equals the entry or continues it after a `/`. */
  readonly prefix?: readonly string[];
}

export interface AppLayerProxyOptions {
  readonly publicRoutes?: AppLayerPublicRoutes;
}

/** The shape next-auth's `auth` expects for its middleware overload. */
type ProxyHandler = (req: NextAuthRequest, event: NextFetchEvent) => NextResponse;

/** Validated and normalised route lists, with the built-in prefixes merged in. */
export interface ResolvedPublicRoutes {
  readonly exact: readonly string[];
  readonly prefix: readonly string[];
}

function requireLeadingSlash(route: string, kind: "exact" | "prefix"): void {
  if (!route.startsWith("/")) {
    throw new Error(
      `Invalid ${kind} public route ${JSON.stringify(route)}: public routes must start with "/".`,
    );
  }
}

/**
 * Strips trailing slashes so `/offline` and `/offline/` behave identically, and
 * rejects a bare `"/"`, which as a prefix would make every route public.
 */
function normalizePrefix(route: string): string {
  requireLeadingSlash(route, "prefix");
  const normalized = route.replace(/\/+$/, "");
  if (normalized === "") {
    throw new Error(
      'Invalid prefix public route "/": it would make every route public. ' +
        'Use { exact: ["/"] } to expose only the root path.',
    );
  }
  return normalized;
}

function normalizeExact(route: string): string {
  requireLeadingSlash(route, "exact");
  return route;
}

/**
 * Validate and normalise the configured public routes once, merging in the
 * built-in prefixes.
 *
 * Called from {@link createAppLayerProxy}, i.e. at module evaluation — a typo
 * fails the build or the server start rather than silently widening the public
 * surface at request time.
 */
export function resolvePublicRoutes(publicRoutes?: AppLayerPublicRoutes): ResolvedPublicRoutes {
  return {
    exact: (publicRoutes?.exact ?? []).map(normalizeExact),
    prefix: [...BUILT_IN_PUBLIC_PREFIXES, ...(publicRoutes?.prefix ?? []).map(normalizePrefix)],
  };
}

/**
 * Whether `pathname` is public.
 *
 * A prefix matches only on a path-segment boundary, so `/record` does not open
 * `/recordings`. Anything not listed is protected: classification fails closed.
 */
export function isPublicRoute(pathname: string, routes: ResolvedPublicRoutes): boolean {
  if (routes.exact.includes(pathname)) {
    return true;
  }
  return routes.prefix.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Decide a single request: pass it through, or send it to the login page.
 *
 * Kept free of Next.js request and next-auth session types so it can be
 * exercised with a plain `URL` and a plain object, without mocking either.
 *
 * The `callbackUrl` is a relative path rather than an absolute URL, so that a
 * consumer which starts honouring it cannot be turned into an open redirect.
 */
export function handleProxyRequest(
  url: URL,
  session: { user?: unknown; error?: unknown } | null | undefined,
  routes: ResolvedPublicRoutes,
): NextResponse {
  const { pathname, search } = url;

  if (isPublicRoute(pathname, routes) || isAuthorized(session)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", url);
  loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

/**
 * Create the OE-standard auth proxy.
 *
 * Wire it in the app's own `middleware.ts` (Next.js 15) or `proxy.ts`
 * (Next.js 16) together with a static `config.matcher` literal that excludes
 * Next.js internals and static assets. That matcher has to be a literal in that
 * file: Next.js extracts it from the file's own AST and silently falls back to
 * matching every request when it finds no literal declaration — which is why
 * this package exports no matcher value to import. The canonical string is in
 * the README, to be copied.
 *
 * App-specific public routes belong in `publicRoutes`, not in the matcher.
 *
 * ⚠️ The proxy must not be the only authorization gate. Verify the session as
 * close to the data as possible as well — a route refactor can silently move a
 * Server Function out of the matcher's reach.
 *
 * @param auth the `auth` function returned by `createAppLayerAuth`
 * @param options app-specific public routes
 */
export function createAppLayerProxy(
  auth: NextAuthResult["auth"],
  options?: AppLayerProxyOptions,
): NextMiddleware {
  const routes = resolvePublicRoutes(options?.publicRoutes);

  // The handler is typed as a whole rather than inferred: `auth` is an
  // intersection of overloads, and a handler inferred as single-parameter also
  // satisfies its App-Router route handler overload, which TypeScript picks
  // first. Declaring the two-parameter shape selects the middleware overload,
  // while the arrow itself ignores the event.
  const handler: ProxyHandler = (req) => handleProxyRequest(new URL(req.url), req.auth, routes);

  return auth(handler);
}
