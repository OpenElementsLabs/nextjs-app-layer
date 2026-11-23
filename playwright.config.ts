import { defineConfig, devices } from "@playwright/test";

/**
 * The E2E harness: a minimal Next.js fixture app (`e2e/fixture-app`) consuming
 * this repository's build, driven against a mock OIDC server from
 * `e2e/docker-compose.yml`.
 *
 * Start the identity provider first — `pnpm e2e:up` — then run `pnpm e2e`.
 * Specs live in `e2e/`.
 */

/** Overridable so a developer running several OE stacks can dodge a port clash. */
const PORT = Number(process.env.E2E_PORT ?? 3300);
const IDP_PORT = Number(process.env.MOCK_OAUTH2_PORT ?? 8300);

const BASE_URL = `http://localhost:${PORT}`;

/**
 * The issuer must be byte-identical for the browser and the Next.js server: the
 * mock server derives the `issuer` claim from the request's Host header, so
 * addressing it any other way produces a different issuer and the token
 * validation fails.
 */
const OIDC_ISSUER = `http://localhost:${IDP_PORT}/default`;

/**
 * Test-only credentials. They authenticate nothing beyond this suite and are
 * committed deliberately, named so that they cannot be mistaken for secrets.
 */
const authEnv = {
  AUTH_SECRET: "e2e-only-not-a-real-secret",
  AUTH_URL: BASE_URL,
  AUTH_TRUST_HOST: "true",
  OIDC_ISSUER,
  OIDC_CLIENT_ID: "e2e-client",
  OIDC_CLIENT_SECRET: "e2e-secret",
  NEXT_TELEMETRY_DISABLED: "1",
};

/**
 * LibreWolf-like hardening. #16's bug was first observed in LibreWolf, so the
 * profile is part of the harness from the start rather than a later addition.
 *
 * First-party isolation partitions cookies by top-level site, which a
 * redirect-based OIDC flow does not cross — each station is itself the top-level
 * site — so this is expected to pass. If it ever does not, that is a product
 * finding about real users, and the prefs are not to be loosened to make the
 * suite green.
 */
const hardenedFirefoxPrefs: Record<string, boolean | number> = {
  "privacy.resistFingerprinting": true,
  "privacy.trackingprotection.enabled": true,
  "privacy.trackingprotection.pbmode.enabled": true,
  "privacy.firstparty.isolate": true,
  // 5 = reject (unvisited) third-party trackers with dynamic first-party isolation.
  "network.cookie.cookieBehavior": 5,
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // The suite shares one identity provider and one app instance, so parallelism
  // would only buy flakiness.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    {
      name: "firefox-hardened",
      use: {
        ...devices["Desktop Firefox"],
        launchOptions: { firefoxUserPrefs: hardenedFirefoxPrefs },
      },
    },
  ],
  webServer: {
    // A production build, not `next dev`: that is what consumers deploy, and the
    // middleware matcher is extracted at build time.
    command: `pnpm --filter ./e2e/fixture-app exec next build && pnpm --filter ./e2e/fixture-app exec next start -p ${PORT}`,
    // `/login` is public, so readiness does not depend on a session.
    url: `${BASE_URL}/login`,
    // Deliberately not `!process.env.CI`. A `next start` left over from an earlier
    // run holds the previous library build in memory, which `pnpm e2e`'s rebuild
    // cannot fix — reusing it would make the suite pass against stale code.
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
    env: authEnv,
  },
});
