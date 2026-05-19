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

- `ROLE_ADMIN`, `ROLE_IT_ADMIN`, `hasRole(session, role)`
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

- OIDC role names: `IT-ADMIN` and `ADMIN` (hardcoded).
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

## Releasing a New Version

Every release must be published to npm **and** have a corresponding Git tag
and GitHub Release.

### Usage

```bash
./release.sh <release-version> <next-version>
```

Example:

```bash
./release.sh 0.2.0 0.3.0
```

The script performs the following steps:

1. Sets the release version in `package.json`
2. Builds, type-checks, lints, formats, and tests the project
3. Commits, tags (`v<version>`), and pushes to GitHub
4. Publishes the package to npm
5. Creates a GitHub Release with auto-generated notes
6. Sets the next development version in `package.json`, commits, and pushes

### Prerequisites

- You must be logged in to npm with publish access to the `@open-elements`
  scope (`pnpm login`).
- The [GitHub CLI (`gh`)](https://cli.github.com/) must be installed and
  authenticated.
- The `NPM_TOKEN` and `GH_TOKEN` environment variables must be set
  (in a `.env` file).
