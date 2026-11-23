# Design: Public crawler files (`robots.txt`, `sitemap.xml`)

## GitHub Issue

_Pending — fill in the issue number once it is created._

Resolves the first open question of spec [`002-app-layer-proxy-api`](../002-app-layer-proxy-api/design.md).

## Summary

The canonical coarse matcher that consuming apps copy into their `middleware.ts` does not exclude
`/robots.txt` or `/sitemap.xml`. Both therefore run through the auth proxy, and because a crawler
carries no session, both are answered with a redirect to `/login`. A search engine requesting
`/robots.txt` receives the login page's HTML instead of the file.

This was raised as an open question in spec 002 rather than fixed there, because changing the
matcher changes behaviour for all five consuming apps. The decision is to fix it: the two
well-known crawler files are excluded from the matcher, exactly as the Next.js documented example
does.

Version 0.10.0 is **not released yet** (`package.json` is still at 0.9.0), so from a consumer's
point of view this is not a follow-up change at all — it lands in the same unreleased version, and
`docs/releases/upgrade-to-0.10.md` simply gains a section.

## Reproduction

1. Wire an app with `createAppLayerProxy` and the coarse matcher as documented in 0.10.0.
2. Without a session, request `/robots.txt`.
3. Observe a `307` to `/login?callbackUrl=%2Frobots.txt` instead of the file.

The same holds for `/sitemap.xml`. It applies whether the file is static in `public/` or generated
by the App Router from `app/robots.ts` / `app/sitemap.ts` — both are served as routes and both are
matched.

## Root cause analysis

The matcher's negative lookahead lists Next.js internals and asset extensions:

```
/((?!_next/static|_next/image|favicon\.ico|.*\.svg$|.*\.png$|.*\.jpg$|.*\.ico$).*)
```

`robots.txt` and `sitemap.xml` match none of these. `.txt` and `.xml` are not among the excluded
extensions — deliberately, since an app may well serve protected `.xml` or `.txt` resources that
must stay behind the auth check. So the files fall through to the proxy, which finds no session and
redirects.

The omission predates spec 002; the 0.9 matcher had the same gap. Spec 002 only made it visible by
documenting the matcher as a reviewed artifact with its own test suite.

## Fix approach

Add both file names to the negative lookahead:

```
/((?!_next/static|_next/image|favicon\.ico|robots\.txt|sitemap\.xml|.*\.svg$|.*\.png$|.*\.jpg$|.*\.ico$).*)
```

**Rationale for naming the files rather than excluding `.txt` and `.xml` as extensions:** only these
two paths are well-known locations that must be publicly readable by definition. Excluding the
extensions wholesale would silently open every `.txt` and `.xml` route an app serves, which is the
opposite of the fail-closed property spec 002 established.

**Rationale for the matcher rather than `publicRoutes`:** these are static, well-known files in the
same category as `favicon.ico`, identical for every app. Handling them at request time would cost a
proxy invocation per crawler request for no benefit, and would mean every app had to remember to
configure them.

The lookahead is anchored at the start of the path, so only the site root is affected:
`/reports/robots.txt` remains protected.

Affected files:

- `src/server/__tests__/proxy-matcher.test.ts` — the canonical literal and its tests
- `README.md` — both documented copies
- `docs/releases/upgrade-to-0.10.md` — the documented copy, plus a section describing the fix

No library source changes. The matcher is documentation; `src/server/proxy.ts` is untouched.

## Regression risk

Low, and bounded by the pinning test introduced in spec 002: the matcher literal exists in four
copies, and the suite fails if the documented ones diverge from the tested one.

The behavioural risk is that an app intentionally served a *protected* `/robots.txt` — for example
to hide a staging site's structure behind auth. That is not a real pattern: a crawler cannot
authenticate, so such a file was never read by the audience it exists for. Hiding a staging site is
done with `X-Robots-Tag`, HTTP auth at the proxy, or by not deploying it publicly.

Worth stating explicitly: this makes two paths publicly readable that were previously
unreachable without a session. If an app placed sensitive content at exactly `/robots.txt` or
`/sitemap.xml`, that content becomes public. No OE app does, and the names are reserved by
convention for exactly this purpose.
