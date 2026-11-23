# Implementation Steps: Playwright E2E harness

All 24 scenarios in `behaviors.md` are harness-level: 7 are Playwright specs, 17 are repository
properties verified by a named command. There is no library source change in this spec.

## Decisions taken while planning

Three points the design left open or did not foresee, settled here:

- **Ports.** Fixture app `3300`, mock IdP `8300`, both overridable by env var. Collision-free against
  `open-crm` (4001, 9081, 5432, 7700, 8888) and `open-transcript` (3100, 3200, 3101), so a developer
  running two stacks at once does not have to edit files.
- **`firefox-hardened` runs from the start**, in these two smoke tests. It costs little and surfaces
  the risk immediately rather than in #16.
- **The fixture app uses a minimal root layout, not `OERootLayout`.** `OERootLayout` imports
  `next/font/google`, which downloads Montserrat and Lato at build time — making every CI run depend
  on `fonts.googleapis.com` reachability for something that tests nothing about auth. The fixture
  layout replicates the provider stack `LoginClient` actually needs (`SessionProvider`,
  `AppLayerTranslationProvider`) without the fonts. This is a deliberate fidelity gap and is recorded
  as such in the README. That `OERootLayout` puts a network dependency into every consumer's build is
  a separate finding, parked in `docs/TODO.md`.

---

## Step 1: Turn the repository into a workspace

- [ ] Add a `packages:` key to `pnpm-workspace.yaml` listing `e2e/fixture-app`, keeping the existing `onlyBuiltDependencies`, `allowBuilds` and `minimumReleaseAgeExclude` entries
- [ ] Run `pnpm install` and commit the resulting `pnpm-lock.yaml`

**Acceptance criteria:**
- [ ] `pnpm-lock.yaml` contains a second importer for `e2e/fixture-app`
- [ ] `pnpm install --frozen-lockfile` succeeds on a clean checkout — the existing `verify` job depends on this
- [ ] `pnpm pack` still produces a tarball containing only `dist`, `src`, `package.json`, `README.md`, `LICENSE`
- [ ] `pnpm run typecheck`, `lint`, `test` and `build` still pass

**Related behaviors:** Nothing from `e2e/` reaches the published package

---

## Step 2: Fixture app skeleton

- [ ] `e2e/fixture-app/package.json` — `"private": true`, `"@open-elements/nextjs-app-layer": "workspace:*"`, plus `next`, `react`, `react-dom`, `@open-elements/ui`, `lucide-react` at the same versions as the library's peer range
- [ ] `e2e/fixture-app/next.config.ts` and `tsconfig.json`
- [ ] `src/auth.ts` — `createAppLayerAuth` reading `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` from env
- [ ] `src/app/api/auth/[...nextauth]/route.ts` — the NextAuth handler
- [ ] `src/app/layout.tsx` — minimal layout wrapping `SessionProvider` and `AppLayerTranslationProvider` (see Decisions)
- [ ] `src/app/login/page.tsx` — `createLoginPage({ appName: "E2E", homeRoute: "/" })`
- [ ] `src/app/page.tsx` — protected page rendering `session.user.name`
- [ ] `public/oe-logo-landscape-dark.svg` — a stub, since `LoginClient` references it and a 404 is avoidable noise

**Acceptance criteria:**
- [ ] `pnpm --filter <fixture> exec next build` succeeds against the library's `dist/`
- [ ] `realpath` of `react` resolves to the same directory from both the repo root and the fixture app
- [ ] The login page renders and its button is visible and clickable without Tailwind configured — the suite asserts behaviour, not appearance
- [ ] `e2e/fixture-app/package.json` declares `"private": true`

**Related behaviors:** The fixture app cannot be published by accident · Both workspace importers resolve one physical React

---

## Step 3: Mock IdP

- [ ] `e2e/mock-oauth2-config.json` — `interactiveLogin: true`, `requestMappings` on `grant_type` for both `authorization_code` and `refresh_token`, carrying `sub`, `name`, `email` and `roles`
- [ ] `e2e/docker-compose.yml` — `ghcr.io/navikt/mock-oauth2-server:3.0.1`, the config mounted at `/config.json`, `JSON_CONFIG_PATH`, port published as `${MOCK_OAUTH2_PORT:-8300}:8080`
- [ ] A healthcheck on the discovery endpoint so `up -d --wait` is meaningful

**Acceptance criteria:**
- [ ] `docker compose -f e2e/docker-compose.yml up -d --wait` returns only once the discovery endpoint answers
- [ ] The discovery document reports `issuer` as the **published host port**, matching what the fixture app is configured with — verified during planning: the server derives the issuer from the request's Host header
- [ ] A manual `curl` of `/default/authorize` serves the login form rather than redirecting
- [ ] The image reference carries the explicit `3.0.1` tag
- [ ] `docker compose -f e2e/docker-compose.yml down` removes the stack

**Related behaviors:** The issuer is identical for the browser and the Next.js server · The compose stack is ready before the tests start · The image is version-pinned

---

## Step 4: Playwright configuration and helpers

- [ ] Add `@playwright/test` as an exact-pinned devDependency
- [ ] `playwright.config.ts` — `testDir: "./e2e"`, `workers: 1`, `fullyParallel: false`, `reporter: "list"`, projects `chromium`, `firefox`, `firefox-hardened` (LibreWolf-like `firefoxUserPrefs`), `webServer` building and starting the fixture app with `reuseExistingServer: false`, `NEXT_TELEMETRY_DISABLED: "1"`, and a timeout generous enough for a production build
- [ ] `e2e/helpers.ts` — `loginViaIdp(page)` using the verified selectors `input[name="username"]` and the `Sign-in` submit button; `expectNoAuthErrorPage(page)` failing on `/api/auth/error`
- [ ] Scripts `e2e:up`, `e2e` (`pnpm run build && playwright test`) and `e2e:down`

**Acceptance criteria:**
- [ ] `pnpm e2e` builds the library before starting Playwright
- [ ] With a `next start` already listening on the configured port, `pnpm e2e` starts its own server anyway
- [ ] All three projects are listed by `pnpm exec playwright test --list`
- [ ] `e2e/helpers.ts` type-checks under the new `tsconfig.e2e.json` from Step 6

**Related behaviors:** A server left over from an earlier run is not reused

---

## Step 5: The two smoke tests

- [ ] `e2e/login.spec.ts` — the redirect-to-login case and the happy path, using both helpers
- [ ] Assert the session claims come from the IdP mapping rather than the typed username
- [ ] Assert `/login` is reachable without a session
- [ ] Assert the redirect carries `callbackUrl=%2F`, as spec 002's proxy produces

**Acceptance criteria:**
- [ ] `pnpm e2e:up && pnpm e2e` passes locally in `chromium`, `firefox` **and** `firefox-hardened`
- [ ] No fixed sleeps — every wait is on an observable condition
- [ ] If `firefox-hardened` fails, the profile is **not** weakened; the failure is reported as a product finding and gets its own issue

**Related behaviors:** Visiting a protected page without a session lands on the login page · The redirect carries the originally requested path · A full login through the mock IdP succeeds · The login never passes through the Auth.js error page · The session carries the claims configured in the mock IdP · The login page is reachable without a session · The IdP is configured to require an interactive login

---

## Step 6: Hygiene — check `e2e/`, do not merely exclude it

- [ ] `tsconfig.e2e.json` covering `e2e/**` and excluding `e2e/fixture-app` (which has its own Next-generated config); wire it into the `typecheck` script
- [ ] Extend `eslint.config.mjs` to `e2e/**` with the base TypeScript rules, but **not** the `no-restricted-globals` storage rules — those guard library code in hardened browsers and would misfire on test code that deliberately inspects storage
- [ ] Extend the `format` and `format:check` scripts to `e2e/`
- [ ] Verify — do not change — that `tsconfig.build.json` and `vitest.config.ts` still see only `src/**`

**Acceptance criteria:**
- [ ] A deliberate type error under `e2e/` fails `pnpm run typecheck`
- [ ] A deliberate lint violation under `e2e/` fails `pnpm run lint`
- [ ] A spec that reads browser storage passes lint
- [ ] `pnpm run test` collects no Playwright spec and needs neither Docker nor a browser
- [ ] `pnpm run build` emits nothing from `e2e/` into `dist/`
- [ ] `pnpm run format:check` passes

**Related behaviors:** `e2e/` is type-checked rather than exempt · `e2e/` is linted rather than exempt · The storage rules do not apply to harness code · The library build ignores `e2e/` · The unit-test run ignores `e2e/` · The fixture app always runs the current library build

---

## Step 7: CI job

- [ ] Add an `e2e` job to `.github/workflows/ci.yml`, alongside `verify` rather than after it
- [ ] Steps: checkout, `pnpm/action-setup`, `setup-node` with `.nvmrc` and the pnpm cache, `pnpm install --frozen-lockfile`, `pnpm run build`, `docker compose … up -d --wait`, restore the Playwright browser cache, `pnpm exec playwright install --with-deps chromium firefox`, `pnpm e2e`
- [ ] Cache the browser download keyed on the resolved `@playwright/test` version
- [ ] On failure, upload the Playwright report and `docker compose logs` as artifacts
- [ ] Keep `permissions: contents: read` — the job needs no token

**Acceptance criteria:**
- [ ] The job runs under the same `pull_request` and `push` triggers as `verify`
- [ ] It does not block or delay `verify`
- [ ] A forced failure uploads both artifacts
- [ ] Report the measured wall-clock in the PR, warm and cold cache

**Related behaviors:** The E2E job runs on every pull request and on pushes to main · A failing run leaves diagnosable artifacts · The fast checks are not delayed by the E2E job

---

## Step 8: Documentation

- [ ] README: a section on running the suite — Docker required, the `e2e:up` / `e2e` / `e2e:down` sequence, the default ports and their env overrides, where new specs go
- [ ] README: record the deliberate fidelity gap — the fixture app does not use `OERootLayout`, and why
- [ ] `docs/TODO.md`: park the finding that `OERootLayout` makes every consumer's build depend on `fonts.googleapis.com`
- [ ] `CLAUDE.md`: **raise, do not silently rewrite.** The file currently holds a prose description of a past merge operation instead of a Project Context section, so there is nothing to update. Fabricating one is out of scope for this spec; `/project-analyze` is the right tool and needs its own decision.

**Acceptance criteria:**
- [ ] A developer can run the suite from the README alone, on a machine with Docker
- [ ] `pnpm run format:check` passes

**Related behaviors:** Running the suite locally is documented

---

## Behavior Coverage

| Scenario | Layer | Covered in Step |
|---|---|---|
| Visiting a protected page without a session lands on the login page | E2E | 5 |
| The redirect carries the originally requested path | E2E | 5 |
| A full login through the mock IdP succeeds | E2E | 5 |
| The login never passes through the Auth.js error page | E2E | 5 |
| The session carries the claims configured in the mock IdP | E2E | 5 |
| The login page is reachable without a session | E2E | 5 |
| Nothing from `e2e/` reaches the published package | Repo | 1 |
| The fixture app cannot be published by accident | Repo | 2 |
| The library build ignores `e2e/` | Repo | 6 |
| The unit-test run ignores `e2e/` | Repo | 6 |
| `e2e/` is type-checked rather than exempt | Repo | 6 |
| `e2e/` is linted rather than exempt | Repo | 6 |
| The storage rules do not apply to harness code | Repo | 6 |
| The fixture app always runs the current library build | Repo | 6 |
| A server left over from an earlier run is not reused | Repo | 4 |
| Both workspace importers resolve one physical React | Repo | 2 |
| The issuer is identical for the browser and the Next.js server | Repo | 3 |
| The IdP is configured to require an interactive login | E2E | 3, 5 |
| The compose stack is ready before the tests start | Repo | 3 |
| The image is version-pinned | Repo | 3 |
| The E2E job runs on every pull request and on pushes to main | Repo | 7 |
| A failing run leaves diagnosable artifacts | Repo | 7 |
| The fast checks are not delayed by the E2E job | Repo | 7 |
| Running the suite locally is documented | Repo | 8 |

24 of 24 scenarios assigned. No scenario is frontend-facing in the component sense — the fixture app
renders library components, and the Playwright specs are what verify them in a browser.
