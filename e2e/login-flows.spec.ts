import { expect, test } from "@playwright/test";
import {
  deletePkceCookie,
  expectNoAuthErrorPage,
  loginButton,
  loginViaIdp,
  startLoginAtIdp,
  submitIdpForm,
} from "./helpers";

/**
 * The interrupted-login flows of #16.
 *
 * PKCE failing in these situations is correct — it is a security check. What is
 * wrong is that the failure surfaces as Auth.js' "Server error — There is a
 * problem with the server configuration" page with no way back, for what is
 * really an expired or superseded login attempt.
 *
 * The three `expired or interrupted` specs below were written **before** the fix
 * and shown to fail against the old code, landing on `/api/auth/error`. That
 * failure is the proof they reproduce the bug.
 */

/**
 * Either signed in, or recoverable on the login page — never a dead end.
 *
 * Retried rather than asserted once, because there is a third, transient state:
 * the tab that lost the race *does* have a session, created by the other tab's
 * callback, so `/login` redirects it to the home route and renders nothing while
 * it does. Polling the settled state avoids racing that redirect without
 * resorting to a fixed wait.
 */
async function expectSignedInOrRecoverable(page: import("@playwright/test").Page): Promise<void> {
  await expect(async () => {
    await expectNoAuthErrorPage(page);

    if (new URL(page.url()).pathname === "/") {
      await expect(page.getByTestId("user-name")).toHaveText("E2E Test User");
      return;
    }

    await expect(page).toHaveURL(/\/login/);
    await expect(loginButton(page)).toBeEnabled();
  }).toPass({ timeout: 15_000 });
}

test.describe("interrupted login", () => {
  test("two parallel logins never reach the error page", async ({ context }) => {
    const first = await context.newPage();
    const second = await context.newPage();

    // Both reach the IdP. The second authorize request overwrites the PKCE
    // cookie, so the first tab's code no longer matches its verifier.
    await startLoginAtIdp(first);
    await startLoginAtIdp(second);

    await submitIdpForm(first);
    await first.waitForURL((url) => !url.hostname.includes("8300"));

    await submitIdpForm(second);
    await second.waitForURL((url) => !url.hostname.includes("8300"));

    await expectSignedInOrRecoverable(first);
    await expectSignedInOrRecoverable(second);
  });

  test("a tab left on the login page recovers with one click", async ({ context }) => {
    const first = await context.newPage();
    const second = await context.newPage();

    await startLoginAtIdp(first);
    await startLoginAtIdp(second);
    await submitIdpForm(first);
    await first.waitForURL((url) => !url.hostname.includes("8300"));

    // Whichever tab lost the race can simply sign in again.
    const stranded = new URL(first.url()).pathname.startsWith("/login") ? first : second;
    if (new URL(stranded.url()).pathname.startsWith("/login")) {
      await loginButton(stranded).click();
      await stranded.waitForSelector('input[name="username"]');
      await submitIdpForm(stranded);
      await stranded.waitForURL((url) => !url.hostname.includes("8300"));
    }

    await expectNoAuthErrorPage(stranded);
    await expect(stranded).toHaveURL(/\/$/);
    await expect(stranded.getByTestId("user-name")).toHaveText("E2E Test User");
  });

  test("a replayed callback never reaches the error page", async ({ page }) => {
    let callbackUrl: string | undefined;
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/api/auth/callback/oidc?") && callbackUrl === undefined) {
        callbackUrl = url;
      }
    });

    await loginViaIdp(page);
    await expect(page).toHaveURL(/\/$/);

    expect(callbackUrl, "the callback request was not observed").toBeDefined();

    // Replays what a reload, a back/forward step or a restored tab would do.
    await page.goto(callbackUrl as string);

    await expectNoAuthErrorPage(page);
    await expect(page.getByTestId("user-name")).toHaveText("E2E Test User");
  });

  test("a missing PKCE cookie never reaches the error page", async ({ page, context }) => {
    await startLoginAtIdp(page);

    // What LibreWolf does by deleting cookies on exit while restoring tabs, and
    // what an expiry past the cookie's 15-minute lifetime does.
    await deletePkceCookie(context);

    await submitIdpForm(page);
    await page.waitForURL((url) => !url.hostname.includes("8300"));

    await expectNoAuthErrorPage(page);
    await expect(page).toHaveURL(/\/login/);
    await expect(loginButton(page)).toBeEnabled();
  });

  test("a login recovers after the PKCE cookie went missing", async ({ page, context }) => {
    await startLoginAtIdp(page);
    await deletePkceCookie(context);
    await submitIdpForm(page);
    await page.waitForURL((url) => !url.hostname.includes("8300"));

    await loginViaIdp(page);

    await expectNoAuthErrorPage(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("user-name")).toHaveText("E2E Test User");
  });
});

test.describe("identity-provider errors", () => {
  test("an error from the identity provider never reaches the error page", async ({ page }) => {
    await startLoginAtIdp(page);

    // What an IdP sends when the user declines consent. Measured against
    // @auth/core 0.41.0: this surfaces as `OAuthCallbackError`, *not*
    // `AccessDenied` — `AccessDenied` comes from the `signIn` callback refusing,
    // which this library's configuration never does. `OAuthCallbackError` is in
    // the client-safe set, so it is passed through by type and classified as
    // retryable, which is correct: declining consent by accident is recoverable.
    await page.goto("/api/auth/callback/oidc?error=access_denied");

    await expectNoAuthErrorPage(page);
    await expect(page).toHaveURL(/\/login/);
    await expect(loginButton(page)).toBeEnabled();
  });
});

test.describe("login button", () => {
  test("is disabled once a sign-in has started", async ({ page }) => {
    await page.goto("/login");

    const button = loginButton(page);
    await expect(button).toBeEnabled();

    await button.click();

    // Either the guard has taken effect, or navigation already left the page —
    // both mean a second sign-in cannot be started from here.
    await Promise.race([
      expect(button).toBeDisabled(),
      page.waitForURL((url) => url.hostname.includes("8300")),
    ]);
  });

  test("a double click still completes the login", async ({ page }) => {
    await page.goto("/login");

    await loginButton(page).dblclick();
    await page.waitForSelector('input[name="username"]');
    await submitIdpForm(page);
    await page.waitForURL((url) => !url.hostname.includes("8300"));

    await expectNoAuthErrorPage(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("user-name")).toHaveText("E2E Test User");
  });
});
