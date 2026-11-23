# TODO

## Test the OIDC session claim mapping in `auth.ts`

Add tests for the NextAuth `session` callback in `src/server/auth.ts`: the
`roles` claim should be carried through to `session.roles` 1:1, and a missing
claim should yield `[]` (not `undefined`). No auth test file exists today, so
these invariants are unverified.

**Context:** Surfaced during `/spec-review` of spec `001-canonical-role-constants`.
The two "Session claim mapping" behavior scenarios are unchanged by that fix and
were left untested (out of scope for the bug fix). Testing requires extracting
the callback or mocking NextAuth, which is disproportionate for that spec.

**Prerequisite:** None.

## Let the backend reject an upload before the body flows (`Expect: 100-continue`)

The proxy streams the request body and forwards `Content-Length`, so a backend
can answer `413` (or `400`/`412`) from the headers alone — but the bytes are
already on their way, and Tomcat has to drain the rest of the body to deliver
that status at all (`server.tomcat.max-swallow-size`). A rejected 500 MB upload
is therefore transferred in full to be discarded.

`Expect: 100-continue` removes that: the request stops after the headers and the
body flows only after `100 Continue`. Browsers cannot use it (`Expect` is a
forbidden header for XHR/fetch), but the proxy leg can — it holds the client
body in backpressure, gets the header verdict, and forwards nothing on a
rejection. Two prerequisites:

- **Node's `fetch` cannot request it.** `undici.request({ expectContinue: true })`
  can, which means replacing `fetch` in `createBackendProxyHandler` with a direct
  undici call — a real dependency and API change, not a flag.
- **The backend must not answer it itself.** Tomcat's `continueResponseTiming`
  defaults to `IMMEDIATELY`, i.e. it sends `100 Continue` when the headers
  arrive, before the application sees the request. It needs
  `ON_REQUEST_BODY_READ` (a connector attribute, not a `server.tomcat.*`
  property) so the application can reject first.

**Context:** surfaced while reviewing the streaming proxy fix (#10 / #11) for
`open-transcript`, whose upload queue re-`PUT`s a recording after a lost
response and is answered `412` — today at the cost of re-uploading the whole
file. Deferred because it only pays off once a consumer measurably suffers from
it, and it touches both the library's HTTP client and the consumer's servlet
container.

**Prerequisite:** #11 (streamed body, forwarded `Content-Length`).

## Decide on one E2E auth pattern across Open Elements frontends

Two incompatible approaches to authenticated E2E tests now exist side by side. `open-transcript`
(`frontend/playwright.config.ts`, `frontend/e2e/session.ts`) deliberately **bypasses** the identity
provider: it mints its own session cookie signed with `AUTH_SECRET` and points OIDC at a closed port
(`http://localhost:9/none`) so that an escaping request fails loudly. The harness planned in #17
does the opposite and drives a real mock OIDC server through the full redirect flow.

Both are defensible for their own purpose — #17 exists precisely to test callback and PKCE handling,
which a minted cookie cannot cover, while `open-transcript` needs auth out of the way to test an
offline shell. What is missing is a documented rule for which to reach for, so the choice stops
being incidental.

- Minted cookie: fast, no Docker, but cannot test login, callback, PKCE, logout or refresh.
- Real mock IdP: covers those flows, costs a Docker dependency and CI wall-clock.

**Context:** Surfaced during the grill session for issue #17 (Playwright E2E harness), after finding
that `open-transcript` already ships a mature Playwright setup built on the opposite assumption.
Deferred because #17 should not be blocked on a cross-repo convention, and the convention is easier
to write once both patterns have run in CI for a while.

**Prerequisite:** #17 (the harness, so the second pattern actually exists in practice).

## Align E2E script and OIDC env-var naming across repos

The existing frontend E2E setups disagree on names, and issue #17 would add a third variant. The
Playwright script is `test:e2e` in `open-transcript` but proposed as `e2e` in #17, and the issuer
env var is `OIDC_ISSUER_URI` in `open-transcript` and `open-crm` but `OIDC_ISSUER` in #17.

Since `createAppLayerAuth` takes the issuer as a config argument and leaves the env-var name to the
consuming app, nothing enforces consistency today. Picking one spelling per concept and recording it
in the conventions would stop each new repo from re-deciding.

**Context:** Surfaced during the grill session for issue #17 while comparing the proposed harness
against the existing setups in `open-transcript` and `open-crm`. Deferred because it is a
cross-repo convention question, not a blocker for the harness itself.

**Prerequisite:** None.

## Migrate consuming apps from `middleware.ts` to `proxy.ts` (Next.js 16)

Next.js 16 deprecates the `middleware` file convention and renames it to `proxy` — the file, the
exported function name, and the Auth.js documented pattern (`export { auth as proxy } from "@/auth"`).
A codemod exists: `npx @next/codemod@canary middleware-to-proxy .`. The library's peer dependency is
still `next: ^15.3.0`, so nothing is forced yet.

Five apps carry a `middleware.ts` that will need this: `open-crm`, `open-tasks`, `open-transcript`,
`bewirtung` and `application-skeleton`. The new proxy factory API is being named for the `proxy`
convention up front so this becomes a file rename rather than a second API migration.

**Context:** Surfaced during the grill session for issue #17 when researching whether the copied
middleware matcher could be replaced by an API. Deferred because it depends on deciding when to raise
the `next` peer dependency to 16, which is a separate call.

**Prerequisite:** The proxy factory API issue (replaces the copied matcher), and a decision to support Next.js 16.
