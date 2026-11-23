import { expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Shared steps for the E2E suite. Keeping the identity provider's markup behind a
 * helper means an upstream change to its login form is fixed in one place rather
 * than in every spec.
 */

/** The mock IdP's interactive login form; verified against image 3.0.1. */
const IDP_USERNAME_FIELD = 'input[name="username"]';
const IDP_SUBMIT_BUTTON = 'input[type="submit"]';
/** Optional claims the form merges *into* those from a matching requestMapping. */
const IDP_CLAIMS_FIELD = 'textarea[name="claims"]';

/** The app's own login button, by its accessible name in either language. */
const LOGIN_BUTTON = /log ?in|anmelden/i;

/** Auth.js' PKCE cookie — the one whose absence breaks a resumed login. */
export const PKCE_COOKIE = "authjs.pkce.code_verifier";

/**
 * Prefixes Auth.js uses for the session cookie. A session larger than the 4 KB
 * cookie limit is split into `<prefix>.0`, `<prefix>.1`, … so matching must be by
 * prefix, which is exactly what `createLogoutHandler` does when deleting them.
 */
const SESSION_COOKIE_PREFIXES = ["authjs.session-token", "__Secure-authjs.session-token"];

/** Names of the session cookies currently held by the context. */
export async function sessionCookieNames(context: BrowserContext): Promise<string[]> {
  const cookies = await context.cookies();
  return cookies
    .map((cookie) => cookie.name)
    .filter((name) => SESSION_COOKIE_PREFIXES.some((prefix) => name.startsWith(prefix)))
    .sort();
}

/**
 * Begin a login and stop on the identity provider's form.
 *
 * Split out from {@link loginViaIdp} because the interrupted-login scenarios
 * (#16) need to interleave two of these, or to tamper with cookies, before the
 * form is submitted.
 */
export async function startLoginAtIdp(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: LOGIN_BUTTON }).click();
  await page.waitForSelector(IDP_USERNAME_FIELD);
}

/**
 * Submit the identity provider's form.
 *
 * The username is recorded in the IdP's log but does **not** become the `sub`
 * claim: a matching `requestMapping` in `e2e/mock-oauth2-config.json` takes
 * priority, so the session's claims come from that configuration. Verified
 * against image 3.0.1.
 */
export async function submitIdpForm(
  page: Page,
  username = "e2e-user",
  extraClaims?: Record<string, unknown>,
): Promise<void> {
  await page.fill(IDP_USERNAME_FIELD, username);
  if (extraClaims !== undefined) {
    await page.fill(IDP_CLAIMS_FIELD, JSON.stringify(extraClaims));
  }
  await page.click(IDP_SUBMIT_BUTTON);
}

/** Drive a complete login, from the app's login page to a landed session. */
export async function loginViaIdp(page: Page, username = "e2e-user"): Promise<void> {
  await startLoginAtIdp(page);
  await submitIdpForm(page, username);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/**
 * Remove Auth.js' PKCE cookie, reproducing scenario D of #16.
 *
 * Deliberately a clear-all plus restore rather than
 * `clearCookies({ name: PKCE_COOKIE })`. Measured: the name filter has no effect
 * under the hardened Firefox profile — `privacy.firstparty.isolate` partitions
 * the cookie so Playwright's filter does not match it, while plain Firefox and
 * Chromium delete it fine. A filtered call therefore *silently* left the cookie
 * in place there, and the login simply succeeded: a scenario that verifies
 * nothing while looking like it does.
 *
 * The cookie is httpOnly, so clearing it from page JavaScript is not an option.
 *
 * The precondition is asserted, not assumed, so a future browser change surfaces
 * as a clear failure here instead of as a test that quietly stops testing.
 */
export async function deletePkceCookie(context: BrowserContext): Promise<void> {
  const keep = (await context.cookies()).filter((cookie) => cookie.name !== PKCE_COOKIE);

  await context.clearCookies();
  await context.addCookies(keep);

  const remaining = (await context.cookies()).filter((cookie) => cookie.name === PKCE_COOKIE);
  expect(remaining, `${PKCE_COOKIE} is still present — this scenario would test nothing`).toEqual(
    [],
  );
}

/** The app's login button, for assertions about its enabled state. */
export function loginButton(page: Page) {
  return page.getByRole("button", { name: LOGIN_BUTTON });
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
