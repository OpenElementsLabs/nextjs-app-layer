# Behaviors: Recoverable login errors

Scenarios marked **[unit]** are Vitest tests. Scenarios marked **[e2e]** are Playwright specs on the
spec 004 harness and run in `chromium`, `firefox` and `firefox-hardened`.

Scenarios marked **[red-first]** must be shown to **fail** against the current code before the fix is
applied — that failure is the proof they reproduce the bug, and #16 requires it.

## Auth configuration

### Auth errors are routed to the login page

- **Given** a configuration built by `createAppLayerAuth`
- **When** its `pages` are inspected
- **Then** `error` is `/login`, alongside `signIn` **[unit]**

### The OIDC checks are unchanged

- **Given** the provider configuration
- **When** its `checks` are inspected
- **Then** PKCE is still in effect — no `checks: []` and no extended cookie lifetime was introduced as
  a workaround **[unit]**

## Message selection

### An access-denied error shows its own message

- **Given** the login page rendered with `?error=AccessDenied`
- **When** it displays
- **Then** the access-denied message is shown, not the expired/interrupted one — retrying does not
  help and must not be implied **[unit]**

### A configuration error shows the expired/interrupted message

- **Given** the login page rendered with `?error=Configuration`
- **When** it displays
- **Then** the expired/interrupted message is shown, together with an enabled login button **[unit]**

### An unknown error type is treated as retryable

- **Given** the login page rendered with `?error=SomethingElseEntirely`
- **When** it displays
- **Then** the expired/interrupted message is shown — the classification is "`AccessDenied` is
  special, everything else is retryable", so a type added by a future `@auth/core` degrades sensibly
  **[unit]**

### No error means no message

- **Given** the login page rendered without an `error` parameter
- **When** it displays
- **Then** no error message is shown and the button is enabled **[unit]**

### The message is available in both languages

- **Given** the translation records
- **When** `login.errorExpired` and `login.errorAccessDenied` are read
- **Then** both exist in `en` and `de`, and `login.error` is still present as the fallback **[unit]**

## The login button

### The button is disabled after the first click

- **Given** the login page
- **When** the button is clicked once
- **Then** it becomes disabled, so a second click cannot start a parallel sign-in **[unit]**

### A double click still completes the login

- **Given** the login page
- **When** the button is double-clicked and the login is then finished at the IdP
- **Then** the user lands on `/` signed in, and never on `/api/auth/error` **[e2e]**

### The button guard is visible in the browser

- **Given** the login page
- **When** the button is clicked and inspected before navigation completes
- **Then** it is disabled **[e2e]**

## Interrupted login flows

### Two parallel logins do not produce an error page

- **Given** two pages in one browser context, both having reached the IdP
- **When** the first login is submitted and then the second
- **Then** neither page is on `/api/auth/error`. Each is either signed in on `/`, or on `/login` with
  the expired/interrupted message and an enabled button **[e2e]** **[red-first]**

### Recovery after a parallel login works with one click

- **Given** a page left on `/login` with the expired/interrupted message by the scenario above
- **When** the login button is clicked and the IdP flow completed
- **Then** the user ends up signed in on `/` **[e2e]** **[red-first]**

### A replayed callback does not produce an error page

- **Given** a completed login, with the `/api/auth/callback/oidc?code=…` URL captured from the
  request log
- **When** that URL is opened a second time
- **Then** the page is not on `/api/auth/error`, and the user is still signed in on `/` — the session
  from the first callback already exists **[e2e]** **[red-first]**

### A missing PKCE cookie does not produce an error page

- **Given** a login that has reached the IdP form
- **When** `authjs.pkce.code_verifier` is deleted from the browser context and the form is submitted
- **Then** the page is on `/login` with the expired/interrupted message, not on `/api/auth/error`
  **[e2e]** **[red-first]**

### Recovery after a missing PKCE cookie works with one click

- **Given** the page left on `/login` by the scenario above
- **When** the login button is clicked and the IdP flow completed
- **Then** the user ends up signed in on `/` **[e2e]** **[red-first]**

### An access-denied response from the IdP is distinguished

- **Given** the mock IdP configured to return `error=access_denied` to the callback
- **When** the login is attempted
- **Then** the page shows the access-denied message, **not** the expired/interrupted one, and is not
  on `/api/auth/error` **[e2e]**

## Unaffected flows

### A normal login still succeeds

- **Given** no session
- **When** the login flow is completed normally
- **Then** the user lands on `/` with the session claims from the IdP — the spec 004 smoke tests
  still pass unchanged **[e2e]**

### An existing session still short-circuits the login page

- **Given** a signed-in user
- **When** `/login` is opened
- **Then** the user is redirected to `homeRoute`. This is the behaviour that turns flows B and C into
  "already signed in" rather than an error **[e2e]**
