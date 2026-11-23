import { expect, test, type Page } from "@playwright/test";
import {
  expectNoAuthErrorPage,
  loginButton,
  loginViaIdp,
  sessionCookieNames,
  startLoginAtIdp,
  submitIdpForm,
} from "./helpers";

/**
 * End-to-end coverage for `createLogoutHandler`.
 *
 * Until now it had unit tests with a stubbed `fetch` only: nothing had ever run
 * it against a real identity provider, in a real browser, with real cookies. Four
 * of the things it does are only observable there — the end-session redirect, the
 * discovery-failure fallback, the deletion of chunked cookies, and whether the
 * user is in fact signed out afterwards.
 *
 * This spec changes no library code. A defect it reveals gets its own issue, so
 * the failing test lands first as proof.
 */

const IDP_END_SESSION = "/default/endsession";

/** Signed out is asserted twice over: no cookie left, and the gate closed again. */
async function expectSignedOut(page: Page): Promise<void> {
  expect(await sessionCookieNames(page.context())).toEqual([]);

  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(loginButton(page)).toBeVisible();
}

test.describe("logout", () => {
  test("removes every session cookie and closes the gate again", async ({ page }) => {
    await loginViaIdp(page);
    expect(await sessionCookieNames(page.context())).not.toEqual([]);

    await page.getByTestId("logout").click();
    await page.waitForURL(/\/login/);

    await expectNoAuthErrorPage(page);
    await expectSignedOut(page);
  });

  test("passes through the identity provider's end-session endpoint", async ({ page }) => {
    await loginViaIdp(page);

    const endSessionRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes(IDP_END_SESSION)) {
        endSessionRequests.push(request.url());
      }
    });

    await page.getByTestId("logout").click();
    await page.waitForURL(/\/login/);

    expect(
      endSessionRequests,
      "logout cleared local cookies without ending the session at the provider",
    ).not.toEqual([]);

    const params = new URL(endSessionRequests[0]).searchParams;
    expect(params.get("post_logout_redirect_uri")).toMatch(/\/login$/);
    expect(params.get("id_token_hint")).toBeTruthy();
  });

  test("lets the user sign in again afterwards", async ({ page }) => {
    await loginViaIdp(page);
    await page.getByTestId("logout").click();
    await page.waitForURL(/\/login/);

    await loginViaIdp(page);

    await expectNoAuthErrorPage(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("user-name")).toHaveText("E2E Test User");
  });

  test("falls back to the login page when the provider cannot be discovered", async ({ page }) => {
    await loginViaIdp(page);

    // The handler's discovery call is wrapped in a deliberate `catch {}`; without
    // it, an IdP outage would leave the user unable to log out at all.
    await page.goto("/api/logout-unreachable-idp");
    await page.waitForURL(/\/login/);

    await expectNoAuthErrorPage(page);
    await expectSignedOut(page);
  });

  test("is harmless without a session", async ({ page }) => {
    await page.goto("/api/logout");
    await page.waitForURL(/\/login/);

    await expectNoAuthErrorPage(page);
    await expect(loginButton(page)).toBeVisible();
  });

  test("is harmless a second time", async ({ page }) => {
    await loginViaIdp(page);
    await page.getByTestId("logout").click();
    await page.waitForURL(/\/login/);

    await page.goto("/api/logout");
    await page.waitForURL(/\/login/);

    await expectNoAuthErrorPage(page);
    await expectSignedOut(page);
  });
});

test.describe("logout with a chunked session", () => {
  /**
   * Inflate the session past the 4 KB cookie limit so Auth.js splits it into
   * numbered cookies. The claim is submitted through the IdP form's `claims`
   * field, which merges into — and cannot overwrite — the configured claims.
   *
   * The size is chosen, not arbitrary. Measured: 1 KB of filler yields two
   * chunks, 3 KB yields four, and 6 KB yields seven — at which point the login
   * stops working altogether and the user is returned to `/login`, because the
   * combined cookies exceed the HTTP header limit. Two chunks is all this
   * scenario needs, and it stays well clear of that ceiling.
   */
  async function loginWithLargeSession(page: Page): Promise<void> {
    await startLoginAtIdp(page);
    await submitIdpForm(page, "e2e-user", { bloat: "x".repeat(1000) });
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  }

  test("splits a large session into numbered cookies", async ({ page }) => {
    await loginWithLargeSession(page);

    const names = await sessionCookieNames(page.context());
    expect(
      names.length,
      "the session did not chunk — the logout scenario below would silently " +
        "degrade to the ordinary single-cookie case",
    ).toBeGreaterThan(1);
    expect(names.some((name) => name.endsWith(".0"))).toBe(true);
  });

  test("removes every chunk, not just the first", async ({ page }) => {
    await loginWithLargeSession(page);
    expect((await sessionCookieNames(page.context())).length).toBeGreaterThan(1);

    await page.getByTestId("logout").click();
    await page.waitForURL(/\/login/);

    await expectNoAuthErrorPage(page);
    await expectSignedOut(page);
  });
});
