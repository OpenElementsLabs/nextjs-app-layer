# Roadmap

## Release 0.10.0

`package.json` is still at `0.9.0`. The version is **not** released until every box below is
checked. `docs/releases/upgrade-to-0.10.md` collects all changes that ship in it.

- [x] Replace the hand-copied middleware matcher with `createAppLayerProxy` (spec `002-app-layer-proxy-api`, PR #18) — **breaking**
- [x] Exclude `robots.txt` and `sitemap.xml` from the coarse matcher (spec `003-public-crawler-files`)
- [ ] Playwright E2E harness with fixture app and mock OIDC server (#17)
- [ ] Interrupted or repeated OIDC login no longer ends on the Auth.js error page (#16)
- [ ] E2E coverage of the logout flow (issue to be created)
- [ ] E2E coverage of the token-refresh flow, including the refresh-failure path (issue to be created)

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

### Known risk: the hardened Firefox profile

#16's acceptance criteria require every scenario to pass in `chromium`, `firefox` **and**
`firefox-hardened`. The hardened profile is not optional polish: the bug was first observed in
LibreWolf, and such a profile partitions cookies by top-level site while the OIDC flow crosses
origins (app and IdP are different ports, hence different sites). If the flow turns out not to
complete under that profile, it blocks #16 and the two flows below — not only #17. This is the
single biggest unknown in the plan and should be answered early, while implementing #17.

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
