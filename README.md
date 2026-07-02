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

- `createAppLayerAuth({ issuer, clientId, clientSecret })`
- `createBackendProxyHandler({ backendUrl, auth })`
- `createLogoutHandler({ auth, oidcIssuer, authUrl })`
- `middlewareConfig` (reference value — see warning below)

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
// src/middleware.ts
export { auth as middleware } from "@/auth";

// `config` MUST be a static literal here. Next.js' build-time analyzer
// extracts the matcher directly from middleware.ts and does NOT follow
// re-exports across package boundaries. Re-exporting the lib's
// `middlewareConfig` as `config` silently disables the matcher in production
// — `/_next/static/*` requests get routed through the auth middleware and
// the deployment breaks. The lib's `middlewareConfig` is reference-only.
export const config = {
  matcher: [
    "/((?!api/auth|api/logout|login|_next/static|_next/image|favicon\\.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.ico$).*)",
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

Releases run through the tag-triggered GitHub Actions workflow
([`.github/workflows/release.yml`](.github/workflows/release.yml)) — there is no
local publishing step.

### Steps

1. Bump `version` in `package.json` and commit.
2. Tag the commit `vX.Y.Z` (the tag must match `package.json`) and push the tag.
3. CI verifies the tag, builds, type-checks, lints, formats, and tests, then
   **stages** the package to npm via OIDC (trusted publishing — no token). The
   version is uploaded to a staging queue and does **not** go live yet.
4. Approve the staged release with 2FA — on [npmjs.com](https://www.npmjs.com/),
   or via the CLI: `pnpm stage list` to find the id, then
   `pnpm stage approve <stage-id>` (`pnpm stage reject <stage-id>` discards it).
5. Publish the draft GitHub Release that the workflow created.

### One-time prerequisites

- A **Trusted Publisher** is configured for the package on npmjs.com (repository
  `OpenElementsLabs/nextjs-app-layer`, workflow `release.yml`, allowed action
  `pnpm stage publish`).
- No `NPM_TOKEN` is required — authentication uses OIDC, and provenance
  attestations are generated automatically.
