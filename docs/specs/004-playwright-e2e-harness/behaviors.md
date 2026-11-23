# Behaviors: Playwright E2E harness

Scenarios marked **[e2e]** are Playwright specs and run in all three projects — `chromium`,
`firefox` and `firefox-hardened`. Scenarios marked **[check]** are properties of the repository
rather than runtime behaviour; each names the command that verifies it, so it can be confirmed in CI
or by hand without a bespoke test.

## Login flow

### Visiting a protected page without a session lands on the login page

- **Given** the fixture app is running and the browser context has no session cookie
- **When** `/` is requested
- **Then** the browser ends up on `/login` and the login button is visible **[e2e]**

### The redirect carries the originally requested path

- **Given** no session
- **When** `/` is requested
- **Then** the resulting URL carries `callbackUrl=%2F`, as spec 002's proxy produces **[e2e]**

### A full login through the mock IdP succeeds

- **Given** no session
- **When** `loginViaIdp(page)` runs — go to `/login`, click the button, fill the IdP form, submit
- **Then** the browser ends up on `/` and the page shows the user's name from the IdP claims **[e2e]**

### The login never passes through the Auth.js error page

- **Given** the login flow above
- **When** it completes
- **Then** the URL never contains `/api/auth/error`, asserted via `expectNoAuthErrorPage` **[e2e]**

### The session carries the claims configured in the mock IdP

- **Given** a completed login
- **When** the session is read
- **Then** `name`, `email` and `roles` match the `requestMapping` claims, not the username typed into
  the form — the mapping takes priority **[e2e]**

### The login page is reachable without a session

- **Given** no session
- **When** `/login` is requested directly
- **Then** the page renders rather than redirecting, because the proxy treats `/login` as a built-in
  public route **[e2e]**

## Harness isolation

### Nothing from `e2e/` reaches the published package

- **Given** the repository with the fixture app in place
- **When** `pnpm pack` runs
- **Then** the tarball contains only `dist`, `src`, `package.json`, `README.md` and `LICENSE` —
  `files` is an allowlist, so this holds by construction **[check]**

### The fixture app cannot be published by accident

- **Given** `e2e/fixture-app/package.json`
- **When** its contents are inspected
- **Then** it declares `"private": true` **[check]**

### The library build ignores `e2e/`

- **Given** `tsconfig.build.json`, which includes only `src/**`
- **When** `pnpm run build` runs
- **Then** `dist/` contains no fixture-app or spec output **[check]**

### The unit-test run ignores `e2e/`

- **Given** `vitest.config.ts`, which includes only `src/**`
- **When** `pnpm run test` runs
- **Then** no Playwright spec is collected, and the run needs neither Docker nor a browser **[check]**

### `e2e/` is type-checked rather than exempt

- **Given** a deliberate type error in a file under `e2e/`
- **When** `pnpm run typecheck` runs
- **Then** it fails — the harness is covered by a tsconfig of its own, so it cannot rot **[check]**

### `e2e/` is linted rather than exempt

- **Given** a lint violation in a file under `e2e/`
- **When** `pnpm run lint` runs
- **Then** it fails **[check]**

### The storage rules do not apply to harness code

- **Given** a Playwright spec that inspects browser storage as part of a test
- **When** `pnpm run lint` runs
- **Then** it passes — `no-restricted-globals` guards library code running in hardened browsers and
  must not misfire on test code **[check]**

## Build freshness

### The fixture app always runs the current library build

- **Given** a change to a file under `src/`
- **When** `pnpm e2e` runs
- **Then** the library is rebuilt first and the fixture app serves the changed code — `workspace:*`
  symlinks the source directory, so no stale snapshot can be served **[check]**

### A server left over from an earlier run is not reused

- **Given** a `next start` for the fixture app already listening on the configured port
- **When** `pnpm e2e` runs
- **Then** Playwright starts its own server rather than reusing that one, because
  `reuseExistingServer` is `false` — reuse would serve the library version held in the old process's
  memory **[check]**

### Both workspace importers resolve one physical React

- **Given** the workspace with the library and the fixture app
- **When** the resolved paths of `react` in both are compared
- **Then** they are the same directory, so the library's `SessionProvider` context and the app's
  React are one instance **[check]**

## Mock IdP contract

### The issuer is identical for the browser and the Next.js server

- **Given** the compose stack with the IdP on its published host port
- **When** the fixture app and the browser each resolve the issuer
- **Then** both use the same host and port — the server derives the issuer from the request's Host
  header, so reaching it over the compose network would yield a different issuer and fail token
  validation **[check]**

### The IdP is configured to require an interactive login

- **Given** `e2e/mock-oauth2-config.json`
- **When** the authorize endpoint is requested
- **Then** it serves the login form rather than redirecting straight back, which is what makes #16's
  interrupted-login scenarios expressible later **[e2e]**

### The compose stack is ready before the tests start

- **Given** `docker compose -f e2e/docker-compose.yml up -d --wait`
- **When** the command returns
- **Then** the IdP answers its discovery endpoint — readiness is awaited rather than slept for **[check]**

### The image is version-pinned

- **Given** `e2e/docker-compose.yml`
- **When** the image reference is inspected
- **Then** it names an explicit tag rather than a floating one, per the reproducible-builds
  convention **[check]**

## CI

### The E2E job runs on every pull request and on pushes to main

- **Given** `.github/workflows/ci.yml`
- **When** its triggers are inspected
- **Then** the `e2e` job runs under the same `pull_request` and `push` triggers as `verify` **[check]**

### A failing run leaves diagnosable artifacts

- **Given** a failing `e2e` job
- **When** the run finishes
- **Then** the Playwright report and `docker compose logs` are uploaded as artifacts **[check]**

### The fast checks are not delayed by the E2E job

- **Given** the workflow
- **When** a pull request is opened
- **Then** `e2e` runs alongside `verify` rather than after it, so a type or lint error is reported
  without waiting for a browser run **[check]**

## Documentation

### Running the suite locally is documented

- **Given** the README
- **When** a developer looks for how to run the E2E tests
- **Then** it states that Docker is required, gives the `e2e:up` / `e2e` / `e2e:down` sequence, and
  says where new specs go **[check]**
