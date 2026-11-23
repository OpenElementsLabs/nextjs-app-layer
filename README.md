# @open-elements/nextjs-app-layer

Reusable Next.js foundation for Open Elements applications: OIDC auth (with
refresh-token handling), the backend proxy, the auth middleware, admin pages
(audit logs, users, server status, bearer token, API keys, webhooks), the
login page, the forbidden page, the OE root layout, and the supporting
providers and types.

The package is consumed by Open CRM and is intended for the wider Open
Elements app family.

## Installation

```bash
pnpm add @open-elements/nextjs-app-layer
```

Peer dependencies (must be provided by the consuming app):

```bash
pnpm add @open-elements/ui next next-auth react react-dom lucide-react
```

## Public entry points

### `@open-elements/nextjs-app-layer` (client-safe)

- `ROLE_APP_ADMIN`, `ROLE_APP_USER`, `ROLE_IT_ADMIN`, `hasRole(session, role)`
- `ForbiddenError`
- DTO types: `Page<T>`, `UserDto`, `AuditAction`, `AuditLogDto`,
  `ApiKeyDto`, `ApiKeyCreateDto`, `ApiKeyCreatedDto`, `WebhookDto`,
  `WebhookCreateDto`, `WebhookUpdateDto`, `TranslationConfigDto`, `PageRequest`
- `AppLayerTranslationProvider`, `useAppLayerTranslations`,
  `appLayerTranslations`, type `AppLayerTranslations`
- `SessionProvider`, `ForbiddenPage`, `BearerTokenCard`, `AddCommentDialog`
- `ApiClientProvider`, `useApiClient`, `defaultApiClient`,
  type `AppLayerApiClient`
- Page factories + clients + metas for each admin page:
  - `createAuditLogsPage`, `AuditLogsClient`, `auditLogsPageMeta`
  - `createUsersPage`, `UsersClient`, `usersPageMeta`
  - `createServerStatusPage`, `ServerStatusClient`, `serverStatusPageMeta`
  - `createBearerTokenPage`, `BearerTokenClient`, `bearerTokenPageMeta`
  - `createApiKeysPage`, `ApiKeysClient`, `apiKeysPageMeta`
  - `createWebhooksPage`, `WebhooksClient`, `webhooksPageMeta`
  - `createLoginPage`, `LoginClient`

### `@open-elements/nextjs-app-layer/server` (server-only)

- `createAppLayerAuth({ issuer, clientId, clientSecret, ...tuning })`
- `createBackendProxyHandler({ backendUrl, auth, forwardRequestHeaders? })`
- `createLogoutHandler({ auth, oidcIssuer, authUrl })`
- `createAppLayerProxy(auth, { publicRoutes? })` — the auth proxy (formerly the
  hand-copied matcher; see [Auth proxy](#auth-proxy))

### `@open-elements/nextjs-app-layer/server/next-auth-types`

Side-effect module that augments NextAuth's `Session` type. Activate via:

```ts
import "@open-elements/nextjs-app-layer/server/next-auth-types";
```

inside your own `auth.ts`.

### `@open-elements/nextjs-app-layer/layout`

`OERootLayout` — root layout component that renders `<html>` with the
Montserrat / Lato font variables and the full provider stack
(`SessionProvider`, `LanguageProvider`, `AppLayerTranslationProvider`,
`ApiClientProvider`). Kept on its own entry point so the `next/font/google`
runtime call does not get pulled into every consumer of the client barrel.

## Wiring (example: a Next.js App-Router app)

```ts
// src/auth.ts
import "@open-elements/nextjs-app-layer/server/next-auth-types";
import { createAppLayerAuth } from "@open-elements/nextjs-app-layer/server";

export const { handlers, auth, signIn, signOut, oidcIssuer } =
  createAppLayerAuth({
    issuer: process.env.OIDC_ISSUER_URI,
    clientId: process.env.OIDC_CLIENT_ID,
    clientSecret: process.env.OIDC_CLIENT_SECRET,
  });
```

### Session and token-refresh tuning

All four options are optional and can also be set per deployment via an env var.
Precedence is: explicit config value > env var > default. Non-numeric or
non-positive values fall back to the default.

| Option                     | Env var                           | Default | Meaning                                                                    |
| -------------------------- | --------------------------------- | ------- | -------------------------------------------------------------------------- |
| `sessionMaxAgeSeconds`     | `AUTH_SESSION_MAX_AGE_SECONDS`    | `28800` | Session/JWT lifetime (8 h)                                                 |
| `sessionUpdateAgeSeconds`  | `AUTH_SESSION_UPDATE_AGE_SECONDS` | `900`   | How often the rolling session cookie is re-issued                          |
| `refreshSkewSeconds`       | `AUTH_TOKEN_REFRESH_SKEW_SECONDS` | `300`   | Refresh this long before access-token expiry, clamped to half its lifetime |
| `oidcTimeoutMs`            | `OIDC_HTTP_TIMEOUT_MS`            | `10000` | Timeout for OIDC discovery and token-endpoint calls                        |

The refresh skew is clamped to `max(5, min(skew, floor(tokenLifetime / 2)))`, so
an IdP that issues short-lived access tokens (≤ 60 s) is contacted at most once
per half-lifetime instead of on every request. Concurrent refreshes of the same
refresh token share a single token-endpoint call, and OIDC discovery is cached
for 10 minutes.

A transient refresh failure (5xx, network error, timeout) keeps the existing
token and is retried on the next request; only a 4xx from the token endpoint —
or a transient failure after the access token has already expired — marks the
session with `error: "RefreshTokenError"`, which makes the middleware treat the
request as unauthenticated.

If your access tokens live for less than two minutes, lower the client-side
session poll accordingly:

```tsx
<SessionProvider refetchInterval={30}>{children}</SessionProvider>
```

```ts
// src/app/api/[...path]/route.ts
import { auth } from "@/auth";
import { createBackendProxyHandler } from "@open-elements/nextjs-app-layer/server";

const handler = createBackendProxyHandler({
  backendUrl: process.env.BACKEND_URL ?? "http://localhost:8080",
  auth,
});
export { handler as GET, handler as POST, handler as PUT, handler as DELETE };
```

The proxy **streams** the request body to the backend (`duplex: "half"`), so
arbitrarily large uploads pass through with constant memory use instead of being
buffered on the heap.

It always forwards `Content-Type`, `Content-Length`, `Accept`, and the range /
conditional headers `Range`, `If-Range`, `If-Match`, `If-None-Match`,
`If-Modified-Since`, and `If-Unmodified-Since`, so browser media seeking
(`206 Partial Content`) and conditional caching work out of the box.

`Content-Length` is forwarded because the body is streamed: without it the
upstream request is framed as `Transfer-Encoding: chunked`, and a backend asking
for the declared length (e.g. Servlet `getContentLengthLong()`) gets `-1`.
Backends use that value to reject an over-sized upload *before* reading the
body, so dropping it would turn a cheap rejection into a full transfer.

On the way back, headers that `fetch` invalidated are corrected rather than
relayed blindly: Node's `fetch` decompresses a `Content-Encoding` response
transparently but leaves the encoding and length describing the compressed
bytes, so both are dropped when the upstream response was encoded (an
uncompressed `206` keeps its `Content-Length`). Hop-by-hop headers
(`Connection`, `Keep-Alive`, `Transfer-Encoding`, …) are never relayed.

The upstream request uses `redirect: "manual"`, because a streamed body is
single-use and cannot be replayed for a `307`/`308`; the `3xx` and its
`Location` are relayed to the client instead. The client's `AbortSignal` is
passed through, so cancelling an upload also aborts the upstream request.

To forward extra application headers (e.g. idempotency keys or checksums), pass
`forwardRequestHeaders`. Matching is case-insensitive. Security-sensitive headers
are always excluded even if listed: `Cookie`, `Host`, `Authorization` (the proxy
sets its own bearer token), and `Connection`.

```ts
const handler = createBackendProxyHandler({
  backendUrl: process.env.BACKEND_URL ?? "http://localhost:8080",
  auth,
  forwardRequestHeaders: ["Idempotency-Key", "X-Checksum-Sha256"],
});
```

```ts
// src/app/api/logout/route.ts
import { auth, oidcIssuer } from "@/auth";
import { createLogoutHandler } from "@open-elements/nextjs-app-layer/server";

export const GET = createLogoutHandler({
  auth,
  oidcIssuer,
  authUrl: process.env.AUTH_URL ?? "http://localhost:3000",
});
```

```ts
// src/middleware.ts  (Next.js 15 — on Next.js 16 name the file src/proxy.ts)
import { createAppLayerProxy } from "@open-elements/nextjs-app-layer/server";
import { auth } from "@/auth";

export default createAppLayerProxy(auth);

// `config` MUST be a static literal here — see "Auth proxy" below for why it
// cannot be imported. It excludes Next.js internals and static assets only;
// app routes belong in `publicRoutes`, not in this regex.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.ico$).*)",
  ],
};
```

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import { OERootLayout } from "@open-elements/nextjs-app-layer/layout";
import { translations } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "My App",
  description: "...",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <OERootLayout translations={translations}>{children}</OERootLayout>;
}
```

```tsx
// src/app/(app)/admin/audit-logs/page.tsx
import { auth } from "@/auth";
import { createAuditLogsPage } from "@open-elements/nextjs-app-layer";
export default createAuditLogsPage({ auth });
```

The same 2-line shape applies to every other admin page.

## Auth proxy

`createAppLayerProxy(auth, options?)` protects every route the matcher lets
through. Requests without a usable session are redirected to `/login` with a
relative `callbackUrl` carrying the originally requested path.

Always public, not configurable: `/api/auth`, `/api/logout` and `/login`
(prefix matches). App-specific public routes go in `publicRoutes`:

```ts
export default createAppLayerProxy(auth, {
  publicRoutes: {
    // public when the pathname equals the entry exactly
    exact: ["/sw.js", "/manifest.webmanifest", "/offline"],
    // public when the pathname equals the entry or continues it after a "/"
    prefix: ["/public-docs"],
  },
});
```

A prefix matches only on a path-segment boundary, so `/record` does not open
`/recordings`. Anything not listed is protected — classification fails closed.
Invalid entries (no leading slash, or `"/"` as a prefix) throw when the factory
is called, i.e. at build or server start, rather than silently widening the
public surface at request time.

### Why the matcher must be copied and cannot be imported

Next.js extracts `config.matcher` by parsing the AST of the middleware file
itself and reading a literal `const config` declaration. If it finds none it
throws internally, swallows the error — its own source comment says *"`export
config` doesn't exist, or other unknown error thrown by swc, silence them"* —
and falls back to a catch-all matcher. The middleware then runs on every
request including `/_next/static/*`, which breaks the deployment with no error
and no warning.

This is why **no matcher value is exported from this package**, not even as a
reference constant: `export const config = { matcher: imported }` is not a
literal either and fails the same silent way. Copy the string below verbatim:

```ts
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.ico$).*)",
  ],
};
```

Note that `/api` is deliberately **not** excluded, unlike the Next.js and
Auth.js documented examples: `createBackendProxyHandler` is mounted under
`/api/*` and must stay behind the auth check.

`robots.txt` and `sitemap.xml` are excluded because a crawler carries no
session and would otherwise receive the login page instead of the file. Only
those two names at the site root are public — the lookahead is anchored there,
so `/reports/robots.txt` and any other `.txt` or `.xml` route stay protected.

### Next.js 16

Next.js 16 renames the `middleware` file convention to `proxy`. Name the file
`src/proxy.ts` instead of `src/middleware.ts`; everything above is otherwise
unchanged, since the proxy is a default export rather than a named
`middleware` export. A codemod exists:
`npx @next/codemod@canary middleware-to-proxy .`

### The proxy is not the only gate

Auth.js is explicit about this: *"You should not rely on the proxy exclusively
for authorization. Always ensure that the session is verified as close to your
data fetching as possible."* Next.js adds that a route refactor can move a
Server Function out of the matcher's reach without warning. Verify the session
in Server Actions and route handlers as well.

## OE conventions this lib assumes

- OIDC role names: `APP-ADMIN`, `APP-USER`, and `IT-ADMIN` (hardcoded).
- Proxy pattern: every backend call goes through `/api/...` in the same
  origin as the Next.js app.
- Fonts: Montserrat (heading), Lato (body).
- Brand: provided by `@open-elements/ui`
  (`@import "@open-elements/ui/styles/brand.css"` in the app's `globals.css`).

## Deferred follow-up work

The current design intentionally keeps the public surface narrow. The
following are not supported today and will be addressed in future versions:

- Configurable role names (per-app role mapping).
- Auth-factory extensibility hooks (custom claims, additional providers,
  signIn validation).
- Page-level customization (sub-component exports, slot props).
- Per-string translation overrides.

## Development

### Prerequisites

- **Node.js ≥ 22** — the exact version is pinned in [`.nvmrc`](.nvmrc) (Node 24).
  With [nvm](https://github.com/nvm-sh/nvm), run `nvm install && nvm use` in the
  project root to match it.
- **pnpm** — pinned via the `packageManager` field in `package.json`. Enable it
  through [Corepack](https://nodejs.org/api/corepack.html) (bundled with Node):
  `corepack enable`. The correct pnpm version is then selected automatically.

### Setup

```bash
pnpm install
```

### Build

```bash
pnpm run build      # compile TypeScript to dist/ (tsc -p tsconfig.build.json)
```

### Quality checks

```bash
pnpm run typecheck      # type-check without emitting
pnpm run lint           # ESLint over src/
pnpm run format:check   # Prettier check (use `pnpm run format` to auto-fix)
pnpm run test           # Vitest (use `pnpm run test:watch` while developing)
```

These are the same checks the release workflow runs in CI before publishing.

## Releasing a New Version

Pushing a `v<version>` tag triggers [`.github/workflows/release.yml`](.github/workflows/release.yml).
It runs the CI checks, _stages_ the npm publish and creates a **draft** GitHub Release. Nothing goes
live until a maintainer approves both by hand (2FA).

`package.json` always holds the last released version.

1. **Check the upgrade guide.** Every user-visible change since the last release must be covered by
   `docs/releases/upgrade-to-<version>.md` for the version you are about to release — review
   `git log v<last-version>..HEAD` against it. Commit the guide before bumping.
2. **Bump the version** on an up-to-date, clean `main`. This commits the new version and creates the
   matching tag in one step; only plain `A.B.C` versions are accepted:

   ```bash
   pnpm version minor --message "chore: release %s"
   ```

3. **Push** — the tag starts the release:

   ```bash
   git push --follow-tags origin main
   ```

4. **Approve the npm publish** once the workflow is green, on npmjs.com or with
   `pnpm stage list` and `pnpm stage approve <stage-id>`.
5. **Publish the draft GitHub Release** after reviewing its generated notes.

### If something goes wrong

- **Workflow failed, nothing staged:** delete the tag, commit the fix, and tag again by hand —
  `package.json` already holds the release version, so do not run `pnpm version` again:

  ```bash
  git tag -d v<version> && git push origin :refs/tags/v<version>
  # commit the fix, then:
  git tag -a v<version> -m "<version>" && git push origin v<version>
  ```

- **Workflow failed after staging:** discard the stage on npmjs.com, then re-cut the tag as above.
- **Wrong content already approved on npm:** published versions are immutable — release a patch
  version instead.
