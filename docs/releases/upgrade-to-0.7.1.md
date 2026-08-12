# Upgrade prompt: `@open-elements/nextjs-app-layer` 0.7.0 → 0.7.1

## Prompt

You are upgrading a Next.js app that depends on `@open-elements/nextjs-app-layer` from 0.7.0 to 0.7.1. This release is **additive and backward compatible** — no public API changed — but it **changes runtime behaviour**: sessions now expire after 8 hours instead of 30 days, and the OIDC access-token refresh is rate-limited, de-duplicated, and no longer fails the session on a transient IdP error. Bump the dependency, then decide whether any of the new tuning options apply to your deployment. Do not change anything outside this scope.

### What changed in 0.7.1

#### Dependencies

Bump only `@open-elements/nextjs-app-layer` to `0.7.1`. No peer dependencies changed: `next`, `next-auth`, `react`, `react-dom`, `lucide-react`, and `@open-elements/ui` stay at whatever versions the consumer already uses. Do **not** change those coordinates as part of this upgrade.

#### Behavioural: the session no longer outlives the access token

0.7.0 used `session: { strategy: "jwt" }` with no `maxAge`, so the session cookie inherited the Auth.js default of **30 days**. The cookie therefore survived weeks after the OIDC access token — and its refresh token — had died: the middleware reported "authenticated" while every proxied API call returned 401.

0.7.1 sets a session and JWT `maxAge` of **8 hours** with a rolling `updateAge` of **15 minutes**. Users of an app that relied on the 30-day cookie will now be redirected to the IdP once per working day (usually a silent SSO round-trip). If you deliberately need a longer session, set it explicitly — do not go back to the default:

```ts
createAppLayerAuth({
  issuer: process.env.OIDC_ISSUER_URI,
  clientId: process.env.OIDC_CLIENT_ID,
  clientSecret: process.env.OIDC_CLIENT_SECRET,
  sessionMaxAgeSeconds: 12 * 60 * 60,
});
```

#### Behavioural: refresh is clamped, de-duplicated, and fails soft

0.7.0 refreshed when the access token was within a hard-coded **60 seconds** of expiry. Against an IdP that issues access tokens with a lifetime of 60 seconds or less (a common Authentik default), that window opened the moment the token was minted, so every RSC render, every client session poll, and every proxied API call POSTed to the token endpoint.

In 0.7.1 the skew is clamped to the observed token lifetime:

```
effectiveSkew = max(5, min(configuredSkew, floor(tokenLifetime / 2)))
```

so short-lived tokens refresh at most once per half-lifetime. In addition:

- Concurrent refreshes of the same refresh token share **one** token-endpoint call, so IdPs with refresh-token rotation no longer invalidate the losers of the race (which showed up as random logouts).
- `.well-known/openid-configuration` is cached for 10 minutes instead of being re-fetched on every refresh.
- Both HTTP calls use `AbortSignal.timeout()` (default 10 s), so a hanging IdP no longer hangs the request.
- Failures are classified: a **4xx** (e.g. `invalid_grant`) means the refresh token is dead and sets `error: "RefreshTokenError"` immediately; a **5xx, network error, or timeout** keeps the existing token and is retried on the next request, and only fails the session once the access token has actually expired.

#### Behavioural: the middleware now rejects a broken session

`authorized()` previously returned `!!session?.user` and ignored `session.error`. A user whose refresh token had died was therefore admitted into an app shell whose API calls all 401'd. It now also requires `session.error !== "RefreshTokenError"`, so such a request is treated as unauthenticated and redirected to `/login`. `session()` is unchanged: it still blanks `accessToken` on that error and still exposes `idToken`, `expiresAt`, `roles`, and `error`.

#### Additive: four optional tuning options on `createAppLayerAuth()`

Each option can also be set via an env var, so a deployment can tune it without a code change. Precedence is: explicit config value > env var > default; non-numeric or non-positive values fall back to the default.

| Option                    | Env var                           | Default | Meaning                                                                    |
| ------------------------- | --------------------------------- | ------- | -------------------------------------------------------------------------- |
| `sessionMaxAgeSeconds`    | `AUTH_SESSION_MAX_AGE_SECONDS`    | `28800` | Session/JWT lifetime (8 h)                                                 |
| `sessionUpdateAgeSeconds` | `AUTH_SESSION_UPDATE_AGE_SECONDS` | `900`   | How often the rolling session cookie is re-issued                          |
| `refreshSkewSeconds`      | `AUTH_TOKEN_REFRESH_SKEW_SECONDS` | `300`   | Refresh this long before access-token expiry, clamped to half its lifetime |
| `oidcTimeoutMs`           | `OIDC_HTTP_TIMEOUT_MS`            | `10000` | Timeout for OIDC discovery and token-endpoint calls                        |

Calling `createAppLayerAuth({ issuer, clientId, clientSecret })` with no tuning keeps working and picks up the defaults.

#### Additive: `SessionProvider` accepts `refetchInterval`

The client session poll was hard-coded to 120 seconds. It is now a prop with the same default, so an app whose access tokens live less than two minutes can poll more often:

```tsx
<SessionProvider refetchInterval={30}>{children}</SessionProvider>
```

`refetchOnWindowFocus` stays enabled. Omitting the prop reproduces 0.7.0 behaviour exactly.

### Steps

1. Bump `@open-elements/nextjs-app-layer` to `0.7.1` in `package.json`; leave all other dependencies untouched. Reinstall (`pnpm install`).
2. Check the access-token lifetime your IdP issues for this app's client. If it is under two minutes, pass `refetchInterval` to `SessionProvider` (roughly half the lifetime, minimum ~15 s) so the browser notices an expired session promptly.
3. Decide whether the 8-hour session fits the app. If it does, do nothing. If not, set `sessionMaxAgeSeconds` (or `AUTH_SESSION_MAX_AGE_SECONDS` in the deployment) explicitly.
4. If the app previously worked around the refresh bug — e.g. a custom `jwt` callback, a manual refresh route, a polling hack, or a shortened `refetchInterval` added to fight repeated 401s — remove that workaround; the library handles it now.
5. Run type-check, build, and the test suite; confirm green before committing.
6. Verify at runtime: sign in, idle past one access-token lifetime, and confirm the app keeps working with a single token-endpoint call per half-lifetime (check the IdP's request log, not just the UI).

### Guard rails

- Do **not** set `sessionMaxAgeSeconds` back to 30 days to "restore old behaviour" — the long cookie is the defect this release fixes.
- Do **not** set `refreshSkewSeconds` larger than half your access-token lifetime expecting earlier refreshes; the value is clamped by design.
- Do **not** add your own `jwt` or `authorized` callback to re-implement refresh handling on top of the library's.
- Do **not** bump `next`, `next-auth`, `react`, `@open-elements/ui`, or any other dependency in the same change.

### Don't do this

- Do not treat `error: "RefreshTokenError"` as recoverable in app code — it now means the refresh token is dead and the user must sign in again.
- Do not lower `oidcTimeoutMs` below a couple of seconds to "fail fast"; a timeout is classified as transient and costs the user a retry.
- Do not bundle this upgrade with unrelated feature work in the same PR.
