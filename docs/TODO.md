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

## Measure test coverage in the build

`.claude/conventions/software-quality.md` requires frontend code to reach at least 70 % coverage,
measured on the code a feature adds or changes, with the build failing below the threshold. This
repo cannot produce the number at all: no `@vitest/coverage-*` provider is installed and the `test`
script is a bare `vitest run`. Coverage can therefore only be argued by inspection, which is not
what the convention asks for.

- Add a coverage provider and a threshold gate to `vitest.config.ts`.
- Wire it into the `verify` job in `.github/workflows/ci.yml` so a PR fails below the floor.
- `open-transcript` already runs `vitest run --coverage` and can serve as the reference.

**Context:** Surfaced during `/quality-review` of spec 002 (app-layer proxy factory API). Deferred
because it predates the spec, affects every file in the repo, and adding a devDependency plus a
build gate to a breaking-API PR would obscure that PR.

**Prerequisite:** None.

## `OERootLayout` makes every consumer build depend on Google Fonts

`src/layout/root-layout.tsx` imports `Montserrat` and `Lato` through `next/font/google`. Next.js
resolves those at **build time**, so every consuming app's `next build` — including every Docker
image build and every CI run — requires `fonts.googleapis.com` to be reachable. A build in a network-
restricted or air-gapped environment fails, and an outage upstream breaks unrelated deployments.

Next.js supports self-hosting font files via `next/font/local`, which would remove the dependency at
the cost of committing the font binaries to the package.

**Context:** Surfaced while implementing spec 004 (Playwright E2E harness). The fixture app
deliberately uses a minimal layout instead of `OERootLayout` for exactly this reason — pulling
Google Fonts into the critical path of a test harness that is supposed to be reliable, for something
that tests nothing about authentication. Deferred because changing the font strategy affects every
consuming app's rendering and deserves its own decision.

**Prerequisite:** None.

## Decide whether the CI `e2e` job should run in the official Playwright container

The `e2e` job currently installs browsers with `pnpm exec playwright install --with-deps chromium
firefox`, backed by an `actions/cache` entry keyed on the exact `@playwright/test` version. The
alternative is to run the job in `mcr.microsoft.com/playwright:v<version>-noble`, which ships the
browsers and system libraries already and pins the browser/OS combination — a better fit for the
reproducible-builds convention than installing packages at run time.

**The numbers are in, and they favour the container.** Measured on the first two runs of the job:

| Step | Cold cache (run #34) | Warm cache (run #36) |
|---|---|---|
| Restore browser cache | 0s (miss) | 1s (hit) |
| Install browsers | 31s | **20s** |
| Run the E2E suite | 41s | 39s |
| `e2e` job total | 113s | **100s** |

The cache saves only ~11s. The residual 20s is `--with-deps` installing system libraries, which no
cache can help with but which the image already contains. Together with the ~6s spent restoring and
saving the cache, switching would take roughly 25s off a 100s job — about a quarter — and would also
delete the cache step and the version-resolution step entirely.

- The image tag must track the `@playwright/test` version, or the browsers and the client drift apart.
  That coupling is the main cost of the change and needs a note in the release process.
- Re-measure after switching: the image is large, so pull time partly offsets the saving.

**Keep this scoped to CI.** Containerising the whole harness — running the browser *and* the fixture
app in Docker — would be a mistake for a specific, measured reason: the mock IdP derives the `issuer`
claim from the request's Host header, so a browser inside a container reaching it as
`host.docker.internal` and a Next.js server reaching it as `localhost` would produce two different
issuer strings and fail token validation. Fixing that means moving the fixture app into compose too,
which gives up Playwright's `webServer` management — including the `reuseExistingServer: false` that
protects against testing a stale `dist/`. That trade only becomes worthwhile if the suite ever needs
to test deployment topology (reverse proxy, HTTPS, differing hostnames), which #16, logout and token
refresh do not.

**Context:** Raised while implementing spec 004, after Playwright's Firefox failed to launch locally
and Docker looked like a way to sidestep browser-profile problems in general. It was not needed: the
failure was [playwright#42768](https://github.com/microsoft/playwright/issues/42768), fixed with one
`CFFIXED_USER_HOME` setting, and all three projects now pass natively.

**Prerequisite:** One real run of the `e2e` job, to have the numbers.

## Decide whether the OIDC provider should also run the `state` and `nonce` checks

The authorize URL `createAppLayerAuth` produces carries `code_challenge` and `code_challenge_method`
but **no `state` and no `nonce`** — measured against the running fixture app in spec 005. The
provider configuration in `src/server/auth.ts` does not set `checks`, so whatever Auth.js defaults to
for this provider shape is what applies, and in practice that is PKCE alone.

PKCE protects the code exchange against interception and injection, which is the main threat the
`state` check also addresses for the authorization-code flow, so this is not presented as a
vulnerability — it is an unexamined default that nobody chose deliberately.

- Establish what Auth.js actually defaults to for a manually declared `type: "oidc"` provider, and
  whether `state`/`nonce` are off because of that declaration rather than by intent.
- If they are enabled, re-run the spec 005 interrupted-login scenarios: `state` adds a second
  single-use cookie, so the two-tab and restored-tab flows may fail in new ways.

**Context:** Observed while implementing spec 005 (#16), which put changing the OIDC checks
explicitly out of scope — weakening or altering a security check was exactly what that issue refused
to do. Deferred so the decision is made on its own merits rather than inside a bug fix.

**Prerequisite:** None, but spec 005's E2E scenarios are what would validate a change.

## A session too large for the HTTP header limit fails the login silently

Measured in spec 006: with roughly 6 KB of extra claims the session splits into seven cookies
totalling about 24 KB, the request carrying them exceeds the HTTP header limit, and the session
cannot be read. The OIDC callback itself succeeds and sets the cookies — it is the *next* request
that fails, so the user is simply returned to `/login` with **no `error` parameter and therefore no
message**. Clicking "Log in" again repeats it forever.

This is the dead end #16 was about, reached by a different route, and spec 005 does not catch it:
there is no auth error to route anywhere.

- Establish the real ceiling (it depends on the Node/Next header limit, which is configurable).
- Decide where a guard belongs. Detecting an unreadably large session in the proxy and showing the
  "expired or interrupted" message would at least name the problem; refusing to issue such a session
  at the callback would be more honest but is a behavioural change.
- 24 KB of claims is far beyond anything an OE app issues today, so this is a latent trap rather than
  a live bug — an app with very many roles or a verbose IdP could reach it.

**Context:** Found while calibrating spec 006's chunked-cookie scenario, which needed a session large
enough to split. Deferred because it is an inherent HTTP constraint, not a defect in this library,
and a fix needs its own design decision.

**Prerequisite:** None.
