import { expect, test, type Page } from "@playwright/test";
import { expectNoAuthErrorPage, loginViaIdp } from "./helpers";

/**
 * End-to-end coverage for the refresh-token flow.
 *
 * `ensureFreshTokens` decides when to refresh, calls the token endpoint, and
 * distinguishes a transient failure from a permanent one. All of that is
 * unit-tested with a stubbed `fetch`; none of it had ever run against an identity
 * provider issuing real, actually-expiring tokens. A regression here is invisible
 * until a user's session dies silently, hours into their working day.
 *
 * This suite runs against its own app instance (the `refresh` project), pointed at
 * the `shortlived` issuer, so the rest of the suite keeps realistic token
 * lifetimes.
 *
 * No library code is changed here. A defect this reveals gets its own issue, with
 * the failing test landing first as proof.
 */

interface SessionSnapshot {
  readonly expiresAt?: number;
  readonly accessToken?: string;
  readonly error?: string;
  readonly user?: { readonly name?: string; readonly email?: string };
  readonly roles?: readonly string[];
}

/**
 * Read the session over HTTP, which is also what *drives* a refresh: the decision
 * lives in the `jwt` callback, which runs when the session is read — there is no
 * background timer.
 */
async function readSession(page: Page): Promise<SessionSnapshot> {
  const response = await page.request.get("/api/auth/session");
  expect(response.ok(), "the session endpoint did not answer").toBe(true);
  return (await response.json()) as SessionSnapshot;
}

/**
 * Fail loudly if this suite is not actually running against the short-lived
 * issuer.
 *
 * Without this, a misrouted project or a dropped env var would leave the tests
 * running against hour-long tokens: "no premature refresh" would pass for the
 * wrong reason and only the refresh test would fail, with a timeout that says
 * nothing about why.
 */
function expectShortLivedToken(session: SessionSnapshot): void {
  expect(session.expiresAt, "the session carries no expiry").toBeDefined();

  const lifetime = (session.expiresAt as number) - Math.floor(Date.now() / 1000);
  expect(
    lifetime,
    `access token lifetime is ${lifetime}s — this suite must run against the ` +
      "`shortlived` issuer, not the default one",
  ).toBeLessThan(60);
}

test.describe("token refresh", () => {
  test("issues a short-lived token to begin with", async ({ page }) => {
    await loginViaIdp(page);

    const session = await readSession(page);
    expectShortLivedToken(session);
    expect(session.accessToken).toBeTruthy();
    expect(session.error).toBeUndefined();
  });

  test("does not refresh while the token is still outside the refresh window", async ({ page }) => {
    await loginViaIdp(page);

    const first = await readSession(page);
    expectShortLivedToken(first);

    // Read again straight away. The clamp is `max(5, min(skew, lifetime / 2))`,
    // so with a 20s token the window opens about 10s in — nothing should have
    // refreshed yet. This is what pins the clamp: a broken one would refresh on
    // every read and this assertion would fail.
    const second = await readSession(page);

    expect(second.expiresAt).toBe(first.expiresAt);
    expect(second.accessToken).toBe(first.accessToken);
  });

  test("refreshes once the token enters the refresh window", async ({ page }) => {
    await loginViaIdp(page);

    const before = await readSession(page);
    expectShortLivedToken(before);

    // Polled, not slept: each read is itself what gives the server a chance to
    // refresh, and the assertion is on the observable change rather than on an
    // assumed deadline.
    await expect
      .poll(async () => (await readSession(page)).expiresAt, {
        message: "the access token never refreshed",
        timeout: 40_000,
        intervals: [1_000],
      })
      .toBeGreaterThan(before.expiresAt as number);

    const after = await readSession(page);
    expect(after.accessToken, "the expiry moved but the token did not").not.toBe(
      before.accessToken,
    );
    expect(after.error, "the refresh reported an error").toBeUndefined();
  });

  test("keeps the session claims across a refresh", async ({ page }) => {
    await loginViaIdp(page);
    const before = await readSession(page);
    expectShortLivedToken(before);

    await expect
      .poll(async () => (await readSession(page)).expiresAt, {
        timeout: 40_000,
        intervals: [1_000],
      })
      .toBeGreaterThan(before.expiresAt as number);

    const after = await readSession(page);
    expect(after.user?.name).toBe("E2E Test User");
    expect(after.user?.email).toBe("e2e@open-elements.test");
    expect(after.roles).toEqual(["APP-ADMIN", "APP-USER", "IT-ADMIN"]);
  });

  test("the user never notices: a protected page still renders after a refresh", async ({
    page,
  }) => {
    await loginViaIdp(page);
    const before = await readSession(page);
    expectShortLivedToken(before);

    await expect
      .poll(async () => (await readSession(page)).expiresAt, {
        timeout: 40_000,
        intervals: [1_000],
      })
      .toBeGreaterThan(before.expiresAt as number);

    await page.goto("/");

    await expectNoAuthErrorPage(page);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("user-name")).toHaveText("E2E Test User");
  });
});
