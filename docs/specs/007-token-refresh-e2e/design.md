# Design: End-to-end coverage for the token-refresh flow

## GitHub Issue

_Pending — "Add E2E coverage for the token-refresh flow". Fill in the number once the issue is
created._

Builds on spec [`004-playwright-e2e-harness`](../004-playwright-e2e-harness/design.md) (#17), which
explicitly left token refresh out of scope. Last item of the 0.10.0 release gate in
[`docs/roadmap.md`](../../roadmap.md).

## Summary

The refresh-token flow is the most intricate logic in this library and the least observable.
`ensureFreshTokens` decides when to refresh, calls the token endpoint, distinguishes a transient
failure from a permanent one, and on a permanent failure marks the session with
`error: "RefreshTokenError"`.

All of it is unit-tested with a stubbed `fetch`. None of it had ever run against an identity provider
issuing real, actually-expiring tokens. A regression here is invisible until a user's session dies
silently, hours into their working day.

This spec adds that coverage. **No library source changes.**

## Goals

- Prove a real token actually refreshes, against a real provider, without the user noticing.
- Pin the refresh-window clamp, so a broken one cannot pass unnoticed.
- Keep the rest of the suite on realistic token lifetimes.

## Non-goals

- Changing the refresh logic.
- Refresh-token rotation and reuse detection.
- Tuning the default session or skew values.
- The permanent-refresh-failure path end to end. See [Scope](#scope-the-failure-path-stays-a-unit-test).

## The timing problem, and how it is solved

A refresh test has to watch a token expire, which makes it the one scenario at real risk of
flakiness. `.claude/conventions/software-quality.md` forbids fixed sleeps, so every wait here polls
an observable condition — the session's `expiresAt` advancing — rather than sleeping past an assumed
deadline. Reading the session is also what *drives* the refresh: the decision lives in the `jwt`
callback, which runs on a session read. There is no background timer.

### Choosing the token lifetime

`effectiveRefreshSkewSeconds` is `max(5, min(configuredSkew, lifetime / 2))`, and the 5-second floor
is the trap. With `tokenExpiry: 2` the token is already inside the refresh window the moment it is
issued and is refreshed on *every* read — a test against that would be green while proving nothing
about the time-based path.

`tokenExpiry: 20` was chosen instead. The server reports `expires_in: 19`, so the skew becomes
`max(5, 9) = 9` and the window opens about ten seconds after sign-in: long enough to assert that
nothing has refreshed yet, short enough that waiting for it is not a chore. Measured: the refresh
test completes in 9.6s, which matches the arithmetic.

### Keeping it out of the rest of the suite

Short-lived tokens must not leak into the other 60 scenarios. Three options were considered:

| Option | Verdict |
|---|---|
| Lower `tokenExpiry` on the shared `default` issuer | Rejected — every other test would run with 20-second sessions and refresh mid-scenario |
| A second NextAuth instance inside the fixture app | Rejected — `createAppLayerAuth` is module-level, and a second instance needs its own callback route, login page and proxy binding |
| A second issuer plus a second app instance | **Chosen** |

The mock server serves any issuer id from its path, verified by requesting
`/shortlived/.well-known/openid-configuration` before relying on it, so a second issuer with
`tokenExpiry: 20` costs one config entry. The fixture app reads its issuer from the environment at
module load, so a second issuer needs a second `next start` — but **not** a second build.

That is why the production build moved out of Playwright's `webServer` and into the `e2e` script:
two servers must not race each other writing `.next`. Both `webServer` entries now run `next start`
only, which also takes the build out of the server-readiness timeout.

The suite runs as its own Playwright project, `refresh`, with its own `baseURL`, and the three
browser projects ignore its spec file. **One browser only, deliberately:** the refresh happens in
the Next.js server's `jwt` callback, so running it three times would add a minute of wall-clock
without covering anything the first run does not.

### The precondition is asserted

Every test calls `expectShortLivedToken` first. A misrouted project or a dropped environment variable
would otherwise leave the suite running against hour-long tokens, where "no premature refresh" passes
for the wrong reason and only the refresh test fails — after a useless 40-second timeout that says
nothing about why. Verified by deliberately pointing the second server at the default issuer: the
tests with the precondition fail in under a second with a message naming the cause; the one that
originally lacked it burned the full timeout. That is why it is now in all five.

## Scope: the failure path stays a unit test

The permanent-refresh-failure path — a 4xx from the token endpoint marking the session with
`error: "RefreshTokenError"`, which `isAuthorized` then treats as unauthenticated — is **not** covered
end to end, and that is a measured decision rather than an omission.

`mock-oauth2-server` cannot be configured to reject a refresh. Verified: an issuer whose
`tokenCallbacks` deliberately omit the `refresh_token` mapping still answers a `refresh_token` grant
with `200` and a fresh token. The remaining ways to force a failure — stopping the container
mid-suite, or interposing a proxy that fails selectively — would make the suite slow and fragile for
one branch.

What covers it instead: `src/server/__tests__/oidc-tokens.test.ts` exercises permanent and transient
failures against a stubbed `fetch`, and `src/server/__tests__/proxy.test.ts` pins that a session
carrying `RefreshTokenError` is redirected to `/login`. The gap is the seam between them — that a
real 4xx produces that session — and it is recorded here rather than papered over.

## Open questions

- Whether the `shortlived` issuer should also be used by a future test for the client-side session
  poll (`SessionProvider refetchInterval`), which this suite does not touch — it reads the session
  over HTTP rather than relying on the React provider's polling.
