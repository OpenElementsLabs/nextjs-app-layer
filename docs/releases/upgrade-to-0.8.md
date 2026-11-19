# Upgrade prompt: `@open-elements/nextjs-app-layer` 0.7.x → 0.8.0

## Prompt

You are upgrading a Next.js app that depends on `@open-elements/nextjs-app-layer` from 0.7.x to 0.8.0. The release reworks the backend proxy (`createBackendProxyHandler`) and raises the `@open-elements/ui` peer dependency to `^0.10.0`. No exported signature was removed or changed; the proxy gained one optional option. Bump both packages, check whether the backend relies on redirects being followed by the proxy, and remove workarounds the new proxy makes unnecessary. Do not change anything outside this scope.

If the app is still on 0.7.0, run [`upgrade-to-0.7.1.md`](upgrade-to-0.7.1.md) first.

### What changed in 0.8.0

#### Dependencies

- Bump `@open-elements/nextjs-app-layer` to `0.8.0`.
- **Breaking:** the peer dependency `@open-elements/ui` moved from `^0.9.0` to `^0.10.0`. On `0.x` a caret range does not cross minor versions, so the app must move `@open-elements/ui` to `^0.10.0` in the same change. Follow the library's own guide, [`upgrade-to-0.10.md`](https://github.com/OpenElementsLabs/open-elements-ui/blob/main/docs/upgrade-to-0.10.md), for that part.
- `next`, `next-auth`, `react`, `react-dom` and `lucide-react` did not change. Leave them as they are.

#### Behavioural: the request body is streamed

0.7.x read the whole request body into memory (`req.arrayBuffer()`) before forwarding it. 0.8.0 streams it (`duplex: "half"`), so uploads of any size pass through with constant memory. Nothing to change in app code. If the app added its own route handler or a size limit only to keep large uploads away from the proxy, that workaround can go.

#### Behavioural: more request headers reach the backend

0.7.x forwarded only `Content-Type` and `Accept`. 0.8.0 always forwards:

```
Content-Type, Content-Length, Accept,
Range, If-Range, If-Match, If-None-Match, If-Modified-Since, If-Unmodified-Since
```

So media seeking (`206 Partial Content`) and conditional requests (`304 Not Modified`) now work through `/api/*`, and a backend sees the real `Content-Length` of an upload. A backend that never expected these headers keeps working. A backend endpoint that answers `If-None-Match` with `304` will now actually do so; client code that treats every non-`200` as an error must accept `304`.

#### Behavioural (breaking-light): redirects are relayed, not followed

The upstream request now uses `redirect: "manual"`. In 0.7.x the proxy followed a backend `3xx` on the server and returned the final response. In 0.8.0 the `3xx` and its `Location` header go to the browser:

```
before: browser → /api/items  → proxy follows 302 → 200 with the target's body
after:  browser → /api/items  → 302 Location: <backend URL>
```

A `fetch()` in the browser follows the redirect itself, but to the `Location` the backend sent. If that is an internal backend URL (e.g. `http://backend:8080/...`) the browser cannot reach it. Typical sources: Spring redirecting to add or drop a trailing slash, or a backend redirecting unauthenticated requests to a login page.

#### Behavioural: response headers are cleaned up

- Hop-by-hop headers (`Connection`, `Keep-Alive`, `Transfer-Encoding`, `TE`, `Trailer`, `Upgrade`, `Proxy-Authenticate`, `Proxy-Authorization`) are no longer relayed to the browser.
- When the backend response was compressed, `Content-Encoding` and `Content-Length` are dropped, because Node's `fetch` has already decoded the body. Before, enabling compression in the backend (Spring `server.compression.enabled`) made browsers fail with `ERR_CONTENT_DECODING_FAILED`.
- `ETag`, `Accept-Ranges`, `Content-Range`, `Cache-Control`, `Content-Type` and `Content-Disposition` are relayed unchanged.

#### Behavioural: cancelled requests are cancelled upstream

The browser request's `AbortSignal` is passed to the backend call. Aborting an upload or a long request in the browser now aborts the backend request too.

#### Additive: `forwardRequestHeaders`

`createBackendProxyHandler` accepts an optional allowlist of extra request headers, matched case-insensitively:

```ts
// before (still valid)
const handler = createBackendProxyHandler({ backendUrl, auth });

// after — only if the backend needs extra headers
const handler = createBackendProxyHandler({
  backendUrl,
  auth,
  forwardRequestHeaders: ["Idempotency-Key", "X-Checksum-Sha256"],
});
```

`Cookie`, `Host`, `Authorization` and `Connection` are never forwarded, even when listed. Omitting the option forwards only the default set above.

### Steps

1. In the app's frontend `package.json`, set `@open-elements/nextjs-app-layer` to `0.8.0` and `@open-elements/ui` to `^0.10.0`. Run `pnpm install`.
2. Carry out the steps of the `@open-elements/ui` 0.10 guide linked above.
3. Look for backend redirects behind `/api/*`: search the backend for redirect responses (e.g. `redirect:`, `ResponseEntity.status(HttpStatus.FOUND)`, `sendRedirect`, trailing-slash handling) and the frontend for `/api/` calls whose path differs from the backend mapping only by a trailing slash. Fix the call path or the backend mapping so the endpoint answers directly instead of redirecting.
4. If the app sends application headers that the backend reads (idempotency keys, checksums, custom `X-…` headers) and that never arrived before, add them to `forwardRequestHeaders`.
5. Remove workarounds made redundant by this release: a custom upload route that bypassed the proxy, a backend switch that kept compression off only because of the proxy, or client code that re-implemented range requests.
6. Run type-check, the test suite and the build. In the running app, open a page that calls the backend and, if the app has them, try an upload and a media file.
7. Commit, e.g. `chore(deps): upgrade @open-elements/nextjs-app-layer to 0.8.0`.

### Guard rails

- Do **not** keep `@open-elements/ui` on `0.9.x` and silence the peer warning; both libraries share React context and must match the declared range.
- Do **not** add `Cookie`, `Host`, `Authorization` or `Connection` to `forwardRequestHeaders`. They are dropped anyway, and listing them suggests they are passed.
- Do **not** wrap the proxy handler to follow redirects on the server. A streamed body cannot be sent twice, which is why redirects are relayed.
- Do **not** bump `next`, `next-auth`, `react`, `react-dom` or `lucide-react` in the same change.

### Don't do this

- Do not buffer the request body yourself (`await req.arrayBuffer()`) before calling the handler; that undoes the streaming.
- Do not copy the old 0.7.x proxy into the app to avoid the redirect change. Fix the redirect at its source.
- Do not bundle this upgrade with unrelated feature work in the same PR.
