import { expect, type Page } from "@playwright/test";

/**
 * Shared steps for the E2E suite. Keeping the identity provider's markup behind a
 * helper means an upstream change to its login form is fixed in one place rather
 * than in every spec.
 */

/** The mock IdP's interactive login form; verified against image 3.0.1. */
const IDP_USERNAME_FIELD = 'input[name="username"]';
const IDP_SUBMIT_BUTTON = 'input[type="submit"]';

/**
 * Drive a complete login: open the app's login page, start the flow, fill the
 * identity provider's form and submit it.
 *
 * The username is recorded in the IdP's log but does **not** become the `sub`
 * claim: a matching `requestMapping` in `e2e/mock-oauth2-config.json` takes
 * priority, so the session's claims come from that configuration. Verified
 * against image 3.0.1.
 */
export async function loginViaIdp(page: Page, username = "e2e-user"): Promise<void> {
  await page.goto("/login");

  await page.getByRole("button", { name: /log ?in/i }).click();

  await page.waitForSelector(IDP_USERNAME_FIELD);
  await page.fill(IDP_USERNAME_FIELD, username);
  await page.click(IDP_SUBMIT_BUTTON);

  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/**
 * Fail if the page ended up on Auth.js' built-in error page.
 *
 * That page reports "Server error - There is a problem with the server
 * configuration" for what is really an invalid login attempt, and offers no way
 * back; see #16. Every spec asserts against it, so a regression shows up as the
 * failure it is rather than as a confusing redirect.
 */
export async function expectNoAuthErrorPage(page: Page): Promise<void> {
  expect(page.url(), "ended up on the Auth.js error page").not.toContain("/api/auth/error");
}
