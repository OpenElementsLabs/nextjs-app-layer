# Design: End-to-end coverage for the logout flow

## GitHub Issue

_Pending — "Add E2E coverage for the logout flow". Fill in the number once the issue is created._

Builds on spec [`004-playwright-e2e-harness`](../004-playwright-e2e-harness/design.md) (#17), which
explicitly left logout out of scope. Required by the 0.10.0 release gate in
[`docs/roadmap.md`](../../roadmap.md).

## Summary

`createLogoutHandler` performs an OIDC end-session flow and deletes every Auth.js session cookie,
including the chunked variants. It has never run against a real identity provider, in a real browser,
with real cookies — only unit tests with a stubbed `fetch`. Whether the user is actually signed out
afterwards is unverified.

This spec adds that coverage. **No library source changes.** If a test reveals a defect, it gets its
own issue so the failing test lands first as proof — the same discipline spec 005 followed.

## Goals

- Prove the user is signed out in the browser, not just that the handler returned a response.
- Prove the end-session flow actually reaches the identity provider.
- Cover the chunked-cookie path, which is the one most likely to be wrong and least likely to be
  caught by a unit test.
- Cover the discovery-failure fallback.

## Non-goals

- Changing `createLogoutHandler`.
- Back-channel logout (`backchannel_logout_uri`).
- A logout control in the admin pages' UI.

## What is untested today

`createLogoutHandler` (`src/server/route-handlers.ts`) does four things only a browser can confirm:

1. Discovers `end_session_endpoint` from the IdP's `.well-known/openid-configuration` and redirects
   there with `id_token_hint` and `post_logout_redirect_uri`.
2. Falls back to `/login` when that discovery fails (a bare `catch {}`).
3. Deletes every cookie whose name starts with `authjs.session-token` or
   `__Secure-authjs.session-token`, **including the numbered chunks** `…​.0`, `…​.1` that appear once
   a session exceeds the 4 KB cookie limit.
4. Sets `secure` from whether `authUrl` is `https://`, which over plain `http://localhost` means the
   deletion must still apply.

## Verified facts

Measured against the running stack before designing the scenarios:

- The mock IdP exposes `end_session_endpoint` at `/default/endsession`. Called bare it answers `200`;
  called with `post_logout_redirect_uri` it answers `302` to exactly that URI. The full
  app → IdP → `/login` chain is therefore observable from the browser's request log.
- The IdP's interactive login form has an optional `claims` textarea. Claims submitted there **add**
  to those from a matching `requestMapping` without overwriting them — which is precisely the lever
  needed to inflate a session past the 4 KB cookie limit and exercise the chunked-cookie path,
  without touching the library or the compose config.

## Technical approach

### Fixture app additions

The fixture app has no logout route yet. Two are added, both fixture-only:

- `src/app/api/logout/route.ts` — mounts `createLogoutHandler({ auth, oidcIssuer, authUrl })` exactly
  as a consumer does.
- `src/app/api/logout-unreachable-idp/route.ts` — the same handler configured with an issuer that
  cannot be discovered, so the fallback branch is reachable. The issuer is otherwise process-wide
  configuration, so a second route is the cheapest way to exercise it without a second compose
  service or a second app instance.

A logout link is added to the protected page so a test can click it the way a user would, rather than
only navigating to the route directly.

### Driving the chunked-cookie case

A session only chunks once the JWT exceeds the 4 KB cookie limit. Rather than reconfiguring the IdP,
the test submits a large claim through the login form's `claims` field:

```json
{ "bloat": "<several KB of filler>" }
```

The claim is carried into the token, the session cookie exceeds the limit, and Auth.js splits it into
`authjs.session-token.0`, `authjs.session-token.1`, … The test asserts the chunks exist **before**
logging out — otherwise a change in cookie sizing would silently reduce the scenario to the ordinary
single-cookie case, the same trap spec 005 hit with the PKCE cookie. Precondition asserted, not
assumed.

### Assertions

Signed-out is asserted on the browser's cookie jar — no cookie whose name starts with a session
prefix remains — and on behaviour: a protected route redirects to `/login` again. Checking only the
redirect would pass even if a stale cookie lingered; checking only cookies would pass even if the
proxy somehow still admitted the request.

## Measured during implementation

Calibrating the chunked-cookie scenario turned up a limit worth recording. Filler added to the
session claims produced:

| Filler | Session cookies | Outcome |
|---|---|---|
| 1 KB | 2 chunks | login succeeds |
| 3 KB | 4 chunks | login succeeds |
| 6 KB | 7 chunks | **login fails — the user is returned to `/login`** |

At seven chunks the cookies total roughly 24 KB, past the HTTP header limit, so the request carrying
them is rejected and the session cannot be read. The callback itself succeeded and set the cookies;
it is the *next* request that fails. The user therefore lands back on `/login` with **no `error`
parameter and no message** — the same silent dead end #16 was about, reached by a different route,
and not fixed by spec 005 because no auth error occurs.

This is an inherent HTTP constraint rather than a defect in this library, and 24 KB of claims is far
beyond anything an OE app issues today. It is recorded in `docs/TODO.md` rather than addressed here,
because diagnosing it needs a decision about where the check belongs. The scenario uses 1 KB, which
chunks reliably and stays well clear.

## Open questions

- Whether the second logout route is worth keeping in the fixture app long-term. It exists only for
  the fallback branch. The alternative — a second compose service with a deliberately broken
  discovery document — is heavier and slower for one `catch {}`.
