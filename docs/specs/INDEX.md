# Spec Index

| ID  | Spec-Folder | Name | Areas | Description | GitHub Issue | Status |
|-----|-------------|------|-------|-------------|--------------|--------|
| 001 | 001-canonical-role-constants | Canonical role constants | frontend, authentication, api | Fix `ROLE_ADMIN` value to `APP-ADMIN`, rename to `ROLE_APP_ADMIN`, add `ROLE_APP_USER`; align role constants to canonical OIDC names (breaking) | #3 | done |
| 002 | 002-app-layer-proxy-api | App-layer proxy factory API | frontend, authentication, api, security | Replace the hand-copied middleware matcher with `createAppLayerProxy`: app routes become a `publicRoutes` option filtered at request time, only a stable static-asset matcher stays copied, `middlewareConfig` is removed (breaking) | — | done |
| 003 | 003-public-crawler-files | Public crawler files | frontend, authentication, security | Exclude `robots.txt` and `sitemap.xml` from the coarse matcher so crawlers receive the files instead of a login redirect; resolves spec 002's first open question | — | done |
| 004 | 004-playwright-e2e-harness | Playwright E2E harness | testing, infrastructure, authentication, build, docker | Fixture Next.js app as a workspace package, pinned mock OIDC server via Docker Compose, Playwright config with chromium/firefox/firefox-hardened, shared helpers, two login smoke tests and a CI `e2e` job | #17 | done |
| 005 | 005-login-error-recovery | Recoverable login errors | frontend, authentication, testing | Route auth errors to `/login` instead of the Auth.js error page, show a cause-specific message with a working retry, and guard the login button against parallel sign-ins | #16 | done |
