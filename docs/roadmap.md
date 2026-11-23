# Roadmap

## Release 0.10.0

`package.json` is still at `0.9.0`. The version is **not** released until every box below is
checked. `docs/releases/upgrade-to-0.10.md` collects all changes that ship in it.

- [x] Replace the hand-copied middleware matcher with `createAppLayerProxy` (spec `002-app-layer-proxy-api`, PR #18) — **breaking**
- [x] Exclude `robots.txt` and `sitemap.xml` from the coarse matcher (spec `003-public-crawler-files`)
- [x] Playwright E2E harness with fixture app and mock OIDC server (#17, PR #19)
- [x] Interrupted or repeated OIDC login no longer ends on the Auth.js error page (#16)
- [x] E2E coverage of the logout flow (spec `006-logout-e2e`)
- [x] E2E coverage of the token-refresh flow (spec `007-token-refresh-e2e`) — the refresh *failure* path stays a unit test; see that spec for why

### Why the release is gated on this

The library currently has no running app, no identity provider and no browser in its test setup, so
login, callback handling, proxy redirects, logout and token refresh cannot be tested here at all —
regressions in them only surface later, in consuming apps. 0.10.0 ships a breaking change to exactly
that area, so it waits until the whole auth lifecycle is covered end to end, not just the parts the
first two issues happen to touch.

### Order

1. **#17** — the harness: fixture app, mock OIDC server, browser projects, helpers, CI job. Every
   item below is a spec file on top of it, so it goes first.
2. **#16** — login error handling. Depends on #17 and prescribes red-green discipline: its E2E tests
   for the two-tab, replayed-callback and missing-pkce-cookie flows must be shown to **fail**
   against the current code before the fix is applied, as proof that they reproduce the bug.
   Writing the fix first would forfeit that proof.
3. **Logout and token refresh** — independent of each other; either order. Both were explicitly out
   of scope for #17 ("can follow in separate issues on top of this harness").

### The hardened Firefox profile

#16's acceptance criteria require every scenario to pass in `chromium`, `firefox` **and**
`firefox-hardened`, because the bug was first observed in LibreWolf. The profile is therefore part
of the harness from the start, not a later addition.

It is worth being precise about *why* LibreWolf showed the bug, because the obvious guess is wrong.
First-party isolation partitions cookies by top-level site, but a redirect-based OIDC flow is itself
the top-level site at every step, so it does not cross that partition — FPI breaks third-party
iframe and silent-renew flows, which this library does not use. #16's own analysis names the real
mechanism: LibreWolf deletes all cookies on exit but restores open tabs, so a restored IdP or
callback tab arrives without the `authjs.pkce.code_verifier` cookie. That is scenario D, and it is
reproducible in any browser by deleting the cookie — which is exactly how #16 proposes to test it.

**Measured, as of spec 004:** the hardened profile passes. All three projects run the login smoke
tests green (12/12), so first-party isolation demonstrably does not break the redirect-based flow.
The remaining LibreWolf exposure is scenario D — the deleted PKCE cookie — which #16 reproduces by
deleting the cookie rather than by hardening the browser. If a future scenario does fail under the
profile, the finding is a real product bug affecting real users, not a harness defect: it gets its
own issue, and the prefs are not weakened to make the suite green.

One operational note for anyone running the suite on macOS: Playwright's Firefox needs
`CFFIXED_USER_HOME` pointed at an empty directory, because macOS 27 TCC-protects
`~/Library/Application Support/Firefox`, which the bundled Firefox reads before the profile
Playwright passes (microsoft/playwright#42768). `playwright.config.ts` handles this for `darwin`.

### Known risk: timing in the token-refresh test

A refresh test must observe a token actually expiring. Fixed sleeps are forbidden by
`.claude/conventions/software-quality.md` ("never wait X seconds and hope"), so the mock IdP needs a
short `tokenExpiry` and the test must poll for the observable change — a new `expiresAt` in the
session — rather than sleeping past an assumed deadline.

Picking that `tokenExpiry` needs care. `effectiveRefreshSkewSeconds` is
`max(5, min(configuredSkew, lifetime / 2))`, so the 5-second floor wins below a 10-second lifetime:
with `tokenExpiry: 2` the token is already inside the refresh window the moment it is issued and
gets refreshed on *every* session read, which proves nothing about the time-based path. A lifetime
around 20 seconds keeps the floor out of the way (skew becomes 10s) and leaves a clean window in
which no refresh happens yet — which is what makes a before/after assertion possible.

### Not part of this release

- Migrating consuming apps from `middleware.ts` to `proxy.ts` (Next.js 16) — see `docs/TODO.md`.
- Measuring coverage in the build — see `docs/TODO.md`.
- E2E coverage of the admin pages.
