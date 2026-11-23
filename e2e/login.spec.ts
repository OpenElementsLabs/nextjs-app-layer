import { expect, test } from "@playwright/test";
import { expectNoAuthErrorPage, loginViaIdp } from "./helpers";

/**
 * The harness's proof of life: the two flows that need a running app, a real
 * identity provider and a real browser at once, and which no unit test in this
 * repository can reach.
 *
 * Further flows — the interrupted-login cases of #16, logout, token refresh —
 * are added as further spec files on top of this setup.
 */

test.describe("login", () => {
  test("redirects an unauthenticated visitor to the login page", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: /log ?in/i })).toBeVisible();
    await expectNoAuthErrorPage(page);
  });

  test("carries the originally requested path as callbackUrl", async ({ page }) => {
    await page.goto("/");

    // Produced by `createAppLayerProxy` (spec 002), which redirects with a
    // relative callbackUrl so it can never become an open redirect.
    expect(new URL(page.url()).searchParams.get("callbackUrl")).toBe("/");
  });

  test("serves the login page without a session", async ({ page }) => {
    await page.goto("/login");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("button", { name: /log ?in/i })).toBeVisible();
  });

  test("signs in through the identity provider and shows the session claims", async ({ page }) => {
    await loginViaIdp(page);

    await expect(page).toHaveURL(/\/$/);
    await expectNoAuthErrorPage(page);

    // The claims come from `e2e/mock-oauth2-config.json`, not from the username
    // typed into the IdP form: a matching requestMapping takes priority.
    await expect(page.getByTestId("user-name")).toHaveText("E2E Test User");
    await expect(page.getByTestId("user-email")).toHaveText("e2e@open-elements.test");
    await expect(page.getByTestId("user-roles")).toHaveText("APP-ADMIN,APP-USER,IT-ADMIN");
  });
});
