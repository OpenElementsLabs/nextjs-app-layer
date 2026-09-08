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
