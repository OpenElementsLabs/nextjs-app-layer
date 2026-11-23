# Behaviors: End-to-end coverage for the logout flow

All scenarios are Playwright specs on the spec 004 harness and run in `chromium`, `firefox` and
`firefox-hardened`. There is no library change in this spec — the scenarios describe behaviour
`createLogoutHandler` is expected to have already.

## Signing out

### Logout removes every session cookie from the browser

- **Given** a signed-in session
- **When** the user logs out
- **Then** no cookie whose name starts with `authjs.session-token` or
  `__Secure-authjs.session-token` remains in the browser context

### Logout lands the user back on the login page

- **Given** a signed-in session
- **When** the user logs out
- **Then** the browser ends up on `/login` with the login button visible, not on an error page

### A protected route is gated again after logout

- **Given** a user who has just logged out
- **When** `/` is requested
- **Then** the browser is redirected to `/login` — asserted in addition to the cookie check, because
  a cleared cookie alone would not prove the proxy stops admitting the request

### The user can sign in again after logging out

- **Given** a user who has just logged out
- **When** the login flow is completed again
- **Then** the user is signed in on `/` with the claims from the IdP

## The end-session flow

### Logout passes through the identity provider's end-session endpoint

- **Given** a signed-in session
- **When** the user logs out
- **Then** the browser's request log contains a request to the IdP's `end_session_endpoint` — the flow
  genuinely ends the session at the provider rather than only clearing local cookies

### The end-session request carries the parameters the provider needs

- **Given** a signed-in session
- **When** the user logs out
- **Then** the end-session request carries `post_logout_redirect_uri` pointing at the app's `/login`,
  and `id_token_hint`

### An unreachable identity provider falls back to the login page

- **Given** a logout handler configured with an issuer whose discovery document cannot be fetched
- **When** the user logs out through it
- **Then** the browser still ends up on `/login` with the session cookies cleared, rather than on an
  error page — the handler's discovery failure is swallowed deliberately

## Chunked session cookies

### A large session is split into numbered cookies

- **Given** a login whose claims push the session past the 4 KB cookie limit
- **When** the session is established
- **Then** the browser holds `authjs.session-token.0` and at least one further numbered chunk —
  asserted as a **precondition**, so a change in cookie sizing cannot silently reduce the next
  scenario to the ordinary single-cookie case

### Logout removes every chunk, not just the first

- **Given** a signed-in session held in chunked cookies
- **When** the user logs out
- **Then** no cookie whose name starts with a session prefix remains, numbered chunks included

### A chunked session is gated again after logout

- **Given** a user who has logged out of a chunked session
- **When** `/` is requested
- **Then** the browser is redirected to `/login`

## Edge cases

### Logging out without a session is harmless

- **Given** a browser with no session
- **When** `/api/logout` is requested directly
- **Then** the browser ends up on `/login` without an error page — a bookmarked or repeated logout
  must not fail

### Logging out twice is harmless

- **Given** a user who has already logged out
- **When** the logout route is requested a second time
- **Then** the browser ends up on `/login` without an error page
