import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

/**
 * A second app instance, configured against an issuer that mints short-lived
 * tokens, so the refresh window can be observed without giving the rest of the
 * suite 20-second sessions.
 */
const REFRESH_PORT = Number(process.env.E2E_REFRESH_PORT ?? 3301);

const BASE_URL = `http://localhost:${PORT}`;
const REFRESH_BASE_URL = `http://localhost:${REFRESH_PORT}`;

/**
 * The issuer must be byte-identical for the browser and the Next.js server: the
 * mock server derives the `issuer` claim from the request's Host header, so
 * addressing it any other way produces a different issuer and the token
 * validation fails.
 */
const OIDC_ISSUER = `http://localhost:${IDP_PORT}/default`;

/**
 * The same mock server, a different issuer id. `e2e/mock-oauth2-config.json`
 * gives `shortlived` a `tokenExpiry` of 20s, which with the app layer's clamp
 * `max(5, min(skew, lifetime / 2))` puts the refresh window about 10s after
 * sign-in — long enough to assert that nothing refreshed yet, short enough that
 * waiting for it is not a chore.
 */
const SHORT_LIVED_ISSUER = `http://localhost:${IDP_PORT}/shortlived`;

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
/**
 * Firefox on macOS needs a home directory of its own.
 *
 * macOS 27 protects `~/Library/Application Support/Firefox` through TCC, and the
 * bundled Firefox reads `profiles.ini` from there *before* opening the
 * `-profile` directory Playwright hands it — so every launch dies with
 * "Could not find profile folder", even though the binary itself runs fine.
 * See microsoft/playwright#42768. `CFFIXED_USER_HOME` points it at an empty
 * directory instead, so it never touches the protected path.
 *
 * Deliberately scoped to macOS: CI runs on Linux, where the protected path does
 * not exist and the default environment is correct.
 */
const firefoxLaunchEnv: Record<string, string> | undefined =
  process.platform === "darwin"
    ? {
        ...(Object.fromEntries(
          Object.entries(process.env).filter(([, value]) => typeof value === "string"),
        ) as Record<string, string>),
        CFFIXED_USER_HOME: mkdtempSync(join(tmpdir(), "pw-firefox-home-")),
      }
    : undefined;

const hardenedFirefoxPrefs: Record<string, boolean | number> = {
  "privacy.resistFingerprinting": true,
  "privacy.trackingprotection.enabled": true,
  "privacy.trackingprotection.pbmode.enabled": true,
  "privacy.firstparty.isolate": true,
  // 5 = reject (unvisited) third-party trackers with dynamic first-party isolation.
  "network.cookie.cookieBehavior": 5,
};

/** The refresh suite needs its own app instance, so it is routed to its own project. */
const REFRESH_SPEC = /token-refresh\.spec\.ts/;

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
    {
      name: "chromium",
      testIgnore: REFRESH_SPEC,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      testIgnore: REFRESH_SPEC,
      use: { ...devices["Desktop Firefox"], launchOptions: { env: firefoxLaunchEnv } },
    },
    {
      name: "firefox-hardened",
      testIgnore: REFRESH_SPEC,
      use: {
        ...devices["Desktop Firefox"],
        launchOptions: { env: firefoxLaunchEnv, firefoxUserPrefs: hardenedFirefoxPrefs },
      },
    },
    {
      // One browser only, deliberately: the refresh happens in the Next.js
      // server's `jwt` callback, so running it three times would add a minute of
      // wall-clock without covering anything the first run does not.
      name: "refresh",
      testMatch: REFRESH_SPEC,
      use: { ...devices["Desktop Chrome"], baseURL: REFRESH_BASE_URL },
    },
  ],
  // Both servers run `next start` only: `pnpm e2e` does the production build, so
  // two servers cannot race each other writing `.next`. A production build, not
  // `next dev`, because that is what consumers deploy and the middleware matcher
  // is extracted at build time.
  //
  // `reuseExistingServer` is deliberately not `!process.env.CI`. A `next start`
  // left over from an earlier run holds the previous library build in memory,
  // which rebuilding cannot fix — reusing it would make the suite pass against
  // stale code.
  webServer: [
    {
      command: `pnpm --filter ./e2e/fixture-app exec next start -p ${PORT}`,
      // `/login` is public, so readiness does not depend on a session.
      url: `${BASE_URL}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: authEnv,
    },
    {
      command: `pnpm --filter ./e2e/fixture-app exec next start -p ${REFRESH_PORT}`,
      url: `${REFRESH_BASE_URL}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...authEnv, AUTH_URL: REFRESH_BASE_URL, OIDC_ISSUER: SHORT_LIVED_ISSUER },
    },
  ],
});
