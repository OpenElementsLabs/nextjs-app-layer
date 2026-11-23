# Behaviors: End-to-end coverage for the token-refresh flow

All scenarios are Playwright specs in the `refresh` project, which runs against its own app instance
pointed at the `shortlived` issuer. One browser only — the refresh happens in the Next.js server's
`jwt` callback, so browser variation adds runtime without coverage.

Every scenario asserts the short-lived-token precondition first, so a misconfiguration fails in under
a second with a message naming the cause rather than after a 40-second poll timeout.

## The precondition

### The suite runs against short-lived tokens

- **Given** a completed login in the `refresh` project
- **When** the session is read
- **Then** its `expiresAt` is less than a minute away, `accessToken` is set and `error` is unset — if
  the lifetime is an hour, the suite is pointed at the wrong issuer and every scenario below would
  pass or fail for the wrong reason

## Refreshing

### No refresh happens while the token is outside the refresh window

- **Given** a session just established with a 20-second token
- **When** the session is read twice in immediate succession
- **Then** `expiresAt` and `accessToken` are unchanged — this pins the clamp
  `max(5, min(skew, lifetime / 2))`; a broken clamp would refresh on every read and fail here

### The token refreshes once the window opens

- **Given** a session just established
- **When** the session is polled until `expiresAt` advances
- **Then** it does advance, `accessToken` is a different value, and `error` is unset

### The expiry and the token move together

- **Given** a refresh has occurred
- **When** the new session is compared with the old one
- **Then** the access token changed as well as the expiry — an advancing expiry alone would not prove
  a new token was obtained

### The claims survive a refresh

- **Given** a refresh has occurred
- **When** the session is read
- **Then** `user.name`, `user.email` and `roles` still carry the values from the IdP's
  `refresh_token` claim mapping

### The user never notices

- **Given** a refresh has occurred
- **When** a protected page is opened
- **Then** it renders with the user's name, the browser is not redirected to `/login`, and it never
  passes through `/api/auth/error`

## Not covered here

### A permanent refresh failure signs the user out

- **Given** a token endpoint answering `4xx` to a `refresh_token` grant
- **When** the session is read
- **Then** it would carry `error: "RefreshTokenError"` and a protected route would redirect to
  `/login`

**Not an end-to-end scenario.** Measured: `mock-oauth2-server` answers a `refresh_token` grant with
`200` and a fresh token even when its `tokenCallbacks` deliberately omit the mapping, so the failure
cannot be provoked through configuration. Covered instead by
`src/server/__tests__/oidc-tokens.test.ts` (permanent and transient failures against a stubbed
`fetch`) and `src/server/__tests__/proxy.test.ts` (a `RefreshTokenError` session redirects to
`/login`). The uncovered seam is that a real `4xx` produces that session — recorded rather than
implied.
