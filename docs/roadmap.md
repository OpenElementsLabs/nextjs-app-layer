# Roadmap

## Release 0.10.0

`package.json` is still at `0.9.0`. The version is **not** released until every box below is
checked. `docs/releases/upgrade-to-0.10.md` collects all changes that ship in it.

- [x] Replace the hand-copied middleware matcher with `createAppLayerProxy` (spec `002-app-layer-proxy-api`, PR #18) — **breaking**
- [x] Exclude `robots.txt` and `sitemap.xml` from the coarse matcher (spec `003-public-crawler-files`)
- [ ] Playwright E2E harness with fixture app and mock OIDC server (#17)
- [ ] Interrupted or repeated OIDC login no longer ends on the Auth.js error page (#16)
- [ ] Full test coverage of the auth flows — see [Release gate](#release-gate)

### Order

#16 depends on #17: it adds login-error scenarios on top of that harness, so #17 lands first.

#16 also prescribes red-green discipline — its E2E tests for the two-tab, replayed-callback and
missing-pkce-cookie flows must be shown to **fail** against the current code before the fix is
applied, as proof that they reproduce the bug. Writing the fix first would forfeit that proof.

### Release gate

The library currently has no running app, no identity provider and no browser in its test setup, so
login, callback handling, proxy redirects, logout and token refresh cannot be tested here at all —
regressions in them only surface later, in consuming apps. That is the gap the release is blocked
on, and #17 plus #16 are what close it.

Note that #16's acceptance criteria require every scenario to pass in `chromium`, `firefox` **and**
`firefox-hardened`. The hardened profile is not optional polish: the bug was first observed in
LibreWolf, and a hardened profile partitions cookies by top-level site while the OIDC flow crosses
origins. If the flow turns out not to complete under that profile, it blocks #16, not only #17.

### Not part of this release

- Migrating consuming apps from `middleware.ts` to `proxy.ts` (Next.js 16) — see `docs/TODO.md`.
- Measuring coverage in the build — see `docs/TODO.md`. Tracked separately from the release gate
  above unless decided otherwise.
