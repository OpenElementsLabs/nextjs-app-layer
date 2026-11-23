# Upgrade prompt: `@open-elements/nextjs-app-layer` 0.9.x → 0.10.0

## Prompt

You are upgrading a Next.js app that depends on `@open-elements/nextjs-app-layer` from 0.9.x to 0.10.0. The release removes the exported `middlewareConfig` and replaces the hand-copied auth matcher with a `createAppLayerProxy` factory. The app's `middleware.ts` must be rewritten. Nothing else changes. Do not change anything outside this scope.

If the app is still on 0.8.x, run [`upgrade-to-0.9.md`](upgrade-to-0.9.md) first.

### What changed in 0.10.0

#### Breaking: `middlewareConfig` is gone

`middlewareConfig` is no longer exported from `@open-elements/nextjs-app-layer/server`. If the app imported it, type-checking now fails with an unresolved export — that is intended. Nothing replaces it: **no matcher value is exported any more, not even as a reference constant.**

The reason is the failure mode it enabled. Next.js extracts `config.matcher` by parsing the AST of the middleware file itself and reading a literal `const config` declaration. When it finds none it swallows the error (its own source comment: *"`export config` doesn't exist, or other unknown error thrown by swc, silence them"*) and falls back to a catch-all matcher, so the middleware runs on every request including `/_next/static/*` — with no error and no warning. `export const config = { matcher: imported }` is not a literal either and fails the same silent way, which is why there is nothing left to import.

#### New: `createAppLayerProxy`

The matcher used to mix two concerns: Next.js internals and asset extensions (which never change) and app routes (`api/auth`, `api/logout`, `login`, plus whatever the app added). The app routes now live in the factory, filtered at request time; only the stable half stays a copied literal.

```ts
createAppLayerProxy(auth, { publicRoutes?: { exact?: string[]; prefix?: string[] } })
```

- `/api/auth`, `/api/logout` and `/login` are always public (prefix matches) and not configurable.
- `exact` entries match the pathname exactly. `prefix` entries match the pathname or anything after a `/` boundary, so `/record` does not open `/recordings`.
- Invalid entries (no leading slash, or `"/"` as a `prefix`) throw when the factory is called, i.e. at build or server start.
- Unauthenticated requests are redirected to `/login` with a relative `callbackUrl` carrying the requested path. `LoginClient` ignores that parameter today, so there is no visible change.

#### Fix: `robots.txt` and `sitemap.xml` are no longer auth-gated

The 0.9 matcher did not exclude them, so a crawler requesting `/robots.txt` or `/sitemap.xml` on a deployed app received the login redirect's HTML instead of the file. The new matcher excludes both. If the app worked around this — by serving them from a different path, or by adding them to its own matcher — remove that workaround.

Dependencies did not change. Leave `next`, `next-auth`, `react`, `react-dom`, `lucide-react` and `@open-elements/ui` as they are.

### Steps

1. In the app's frontend `package.json`, set `@open-elements/nextjs-app-layer` to `0.10.0`. Run `pnpm install`.
2. Open the app's `src/middleware.ts` and read the existing `config.matcher` string. Compare it against the 0.9 baseline:

   ```
   /((?!api/auth|api/logout|login|_next/static|_next/image|favicon\.ico|.*\.svg$|.*\.png$|.*\.jpg$|.*\.ico$).*)
   ```

   Everything the app added **beyond** that baseline is an app-specific public route and has to move into `publicRoutes`. Note each addition before continuing.
3. Replace the whole file with:

   ```ts
   // src/middleware.ts
   import { createAppLayerProxy } from "@open-elements/nextjs-app-layer/server";
   import { auth } from "@/auth";

   export default createAppLayerProxy(auth);

   // `config` MUST be a static literal here; it cannot be imported.
   export const config = {
     matcher: [
       "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.ico$).*)",
     ],
   };
   ```

   Note the export changed from `export { auth as middleware }` to a **default** export, and that `api/auth`, `api/logout` and `login` are no longer in the matcher — the proxy handles them.
4. Move the additions noted in step 2 into `publicRoutes`. Use `exact` for a single resource and `prefix` for a route group with sub-pages. For an app whose 0.9 matcher additionally excluded `offline`, `record-e2e`, `manifest.webmanifest` and `sw.js` (this is `open-transcript`), the result is:

   ```ts
   export default createAppLayerProxy(auth, {
     publicRoutes: {
       exact: ["/offline", "/manifest.webmanifest", "/sw.js"],
       prefix: ["/record-e2e"],
     },
   });
   ```

   `/record-e2e` is a `prefix` because it has sub-pages; the other three are single resources.
5. Run type-check, the test suite and the build. In the running app, verify: a logged-out visit to a protected page lands on `/login`; logging in works; every route listed in `publicRoutes` is reachable while logged out; and the browser devtools Network tab shows `/_next/static/*` requests returning assets rather than a redirect.
6. Commit, e.g. `chore(deps): upgrade @open-elements/nextjs-app-layer to 0.10.0`.

### Guard rails

- Do **not** import a matcher from the library and assign it to `config` — there is nothing to import, and doing so would reintroduce exactly the silent fallback this release removes. Copy the literal.
- Do **not** add `api` to the matcher's negative lookahead. `createBackendProxyHandler` is mounted under `/api/*` and must stay behind the auth check; only `/api/auth` and `/api/logout` are public, and the proxy handles those.
- Do **not** keep `export { auth as middleware }` alongside the new default export. Next.js supports exactly one proxy function per file.
- Do **not** put `"/"` in `prefix`. It would make every route public, and the factory throws on it.
- Do **not** rename `middleware.ts` to `proxy.ts` in this change. That belongs to the Next.js 16 upgrade and is tracked separately.
- Do **not** bump `next`, `next-auth`, `react`, `react-dom`, `lucide-react` or `@open-elements/ui` in the same change.

### Don't do this

- Do not drop `config` entirely and rely on the proxy to filter everything at runtime. Without a matcher Next.js invokes the proxy for every request, including static assets, through a separate render server — the Next.js docs warn that this "can unintentionally block CSS, JS, or images from loading".
- Do not treat the proxy as the only authorization gate. Auth.js: *"You should not rely on the proxy exclusively for authorization. Always ensure that the session is verified as close to your data fetching as possible."* Keep session checks in Server Actions and route handlers.
- Do not bundle this upgrade with unrelated feature work in the same PR.
