# Implementation Steps: App-layer proxy factory API

All 41 scenarios in `behaviors.md` are backend/server-side. There is no UI change in this spec, so
no frontend test step is required — `LoginClient` is untouched.

## Step 1: Route classification and option validation

- [x] Create `src/server/proxy.ts` with the public option types `AppLayerPublicRoutes` and `AppLayerProxyOptions`
- [x] Add the non-configurable `BUILT_IN_PUBLIC_PREFIXES` (`/api/auth`, `/api/logout`, `/login`)
- [x] Implement `resolvePublicRoutes(publicRoutes?)` — normalises entries and throws on an entry without a leading slash and on `"/"` as a `prefix` entry
- [x] Implement `isPublicRoute(pathname, routes)` as a pure function with the `pathname === p || pathname.startsWith(p + "/")` prefix rule
- [x] Create `src/server/__tests__/proxy.test.ts` covering classification and validation

**Acceptance criteria:**
- [x] `isPublicRoute` and `resolvePublicRoutes` are pure and take no Next.js or next-auth types, so they need no mocks
- [x] Validation errors name the offending entry
- [x] `pnpm run typecheck` passes
- [x] `pnpm run test` passes

**Related behaviors:** The login page is reachable without a session · Auth.js routes are reachable without a session · The logout route is reachable without a session · Built-in public routes match by prefix · A path that merely starts with the same characters is still protected · An exact entry matches its own path · An exact entry does not match a sub-path · An exact entry matches a file-like path · A prefix entry matches its own path · A prefix entry matches a sub-path · A prefix entry respects the path-segment boundary · A configured prefix tolerates a trailing slash · A requested path with a trailing slash matches its prefix · Exact and prefix entries combine · A route without a leading slash is rejected · A bare `/` prefix is rejected · A bare `/` is acceptable as an exact entry · Validation happens once, at factory call time · Omitted options are valid · An empty `publicRoutes` object is valid

---

## Step 2: Request handling and the proxy factory

- [x] Add `handleProxyRequest(nextUrl, session, routes)` to `src/server/proxy.ts` — returns `NextResponse.next()` for public or authorized requests, otherwise a redirect to `/login` with a relative `callbackUrl` of `pathname + search`
- [x] Reuse `isAuthorized` from `./oidc-tokens` rather than re-implementing the predicate
- [x] Implement `createAppLayerProxy(auth, options?)` as a thin wrapper that resolves the routes once and delegates each request to `handleProxyRequest`
- [x] Extend `src/server/__tests__/proxy.test.ts` with redirect, pass-through and session-error cases

**Acceptance criteria:**
- [x] `handleProxyRequest` is testable by passing a plain URL and a plain session object — no NextAuth instance and no mocks
- [x] `callbackUrl` is always a path, never an absolute URL
- [x] Classification fails closed: an unmatched path is protected
- [x] `pnpm run typecheck` passes
- [x] `pnpm run test` passes

**Related behaviors:** An unauthenticated request to a protected route is redirected · The redirect carries the originally requested path · The redirect preserves the query string · `callbackUrl` is always relative · An authenticated request passes through · An unknown path is protected, not public · A root request without a session is redirected · A session with a refresh-token error is treated as unauthenticated · A session without a user is treated as unauthenticated · A public route stays reachable even with a broken session

---

## Step 3: Remove `middlewareConfig` and update the public surface

- [x] Delete `src/server/middleware.ts`
- [x] Update `src/server.ts`: drop the `middlewareConfig` export, add `createAppLayerProxy` and its option types
- [x] Confirm nothing matcher-shaped remains exported — no string, no config object
- [x] Add a public-surface test asserting the exports of `src/server.ts`

**Acceptance criteria:**
- [x] `middlewareConfig` is no longer importable from `@open-elements/nextjs-app-layer/server`
- [x] No export is matcher-shaped, so there is nothing a consumer can wrongly re-export into `config`
- [x] `pnpm run typecheck`, `pnpm run lint` and `pnpm run test` pass
- [x] `pnpm run build` succeeds

**Related behaviors:** `middlewareConfig` is gone · No matcher constant is exported · The proxy factory is exported from the server entry point

---

## Step 4: Matcher behaviour tests

- [x] Create `src/server/__tests__/proxy-matcher.test.ts` using `unstable_doesMiddlewareMatch` from `next/experimental/testing/server`
- [x] Hold the canonical coarse matcher as a literal in the test file (it is documentation, not an export)
- [x] Assert that application routes match and that Next.js internals and asset extensions do not
- [x] Assert explicitly that `/api/users` **does** match, pinning the decision to keep the backend proxy auth-gated

**Acceptance criteria:**
- [x] Matcher behaviour is asserted, not string equality
- [x] The test documents why `/api` as a whole is not excluded
- [x] `pnpm run test` passes

**Related behaviors:** Application routes reach the proxy · Nested application routes reach the proxy · Next.js static chunks bypass the proxy · Next.js image optimization bypasses the proxy · The favicon bypasses the proxy · Asset extensions bypass the proxy · Backend proxy routes are NOT excluded by the matcher · Auth routes are no longer excluded by the matcher

---

## Step 5: README

- [x] Replace the `middlewareConfig` entry in the server entry-point list with `createAppLayerProxy`
- [x] Rewrite the wiring section to show the factory with `publicRoutes`, for both the Next 15 `middleware.ts` and the Next 16 `proxy.ts` conventions
- [x] Document the canonical coarse matcher literal and why it must be copied rather than imported
- [x] Add the Auth.js warning that the proxy must not be the only authorization gate

**Acceptance criteria:**
- [x] A reader can wire the proxy from the README alone, on Next 15 and Next 16
- [x] The README no longer references `middlewareConfig`
- [x] `pnpm run format:check` passes

**Related behaviors:** — (documentation)

---

## Step 6: Upgrade guide

- [x] Create `docs/releases/upgrade-to-0.10.md` as an AI-executable prompt, matching the style of `upgrade-to-0.9.md`
- [x] Describe the `middlewareConfig` removal, the new factory, how to translate an existing app-specific matcher into `publicRoutes`, and guard rails
- [x] Do **not** bump `package.json` — the version bump belongs to the separate release commit, as in 0.9.0

**Acceptance criteria:**
- [x] The guide translates `open-transcript`'s four extra routes as a worked example
- [x] Guard rails forbid re-exporting a matcher and bundling the Next 16 file rename into the same change

**Related behaviors:** — (documentation)

---

## Behavior Coverage

| Scenario group | Count | Layer | Covered in Step |
|---|---|---|---|
| Matcher: what never reaches the proxy | 8 | Backend | 4 |
| Built-in public routes | 5 | Backend | 1, 2 |
| Configured public routes — exact | 3 | Backend | 1, 2 |
| Configured public routes — prefix | 6 | Backend | 1, 2 |
| Protected routes | 7 | Backend | 2 |
| Session error states | 3 | Backend | 2 |
| Configuration validation | 6 | Backend | 1 |
| Public API surface | 3 | Backend | 3 |
| **Total** | **41** | | |

No scenario is unassigned, and none is frontend-facing.
