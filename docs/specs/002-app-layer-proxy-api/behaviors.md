# Behaviors: App-layer proxy factory API

Scenarios marked **[matcher]** are verified with `unstable_doesMiddlewareMatch` from
`next/experimental/testing/server` against the documented coarse matcher literal. All others
exercise the proxy or its pure route-classification function directly.

## Matcher: what never reaches the proxy

### Application routes reach the proxy

- **Given** the documented coarse matcher
- **When** the request path is `/`
- **Then** the matcher matches, so the proxy is invoked **[matcher]**

### Nested application routes reach the proxy

- **Given** the documented coarse matcher
- **When** the request path is `/admin/users`
- **Then** the matcher matches, so the proxy is invoked **[matcher]**

### Next.js static chunks bypass the proxy

- **Given** the documented coarse matcher
- **When** the request path is `/_next/static/chunks/main.js`
- **Then** the matcher does not match, so the proxy is never invoked **[matcher]**

### Next.js image optimization bypasses the proxy

- **Given** the documented coarse matcher
- **When** the request path is `/_next/image`
- **Then** the matcher does not match **[matcher]**

### The favicon bypasses the proxy

- **Given** the documented coarse matcher
- **When** the request path is `/favicon.ico`
- **Then** the matcher does not match **[matcher]**

### Asset extensions bypass the proxy

- **Given** the documented coarse matcher
- **When** the request path ends in `.svg`, `.png`, `.jpg` or `.ico` (e.g. `/oe-logo-landscape-dark.svg`)
- **Then** the matcher does not match **[matcher]**

### Backend proxy routes are NOT excluded by the matcher

- **Given** the documented coarse matcher
- **When** the request path is `/api/users`
- **Then** the matcher matches, so the backend proxy stays behind the auth check **[matcher]**

### Auth routes are no longer excluded by the matcher

- **Given** the documented coarse matcher
- **When** the request path is `/api/auth/signin`
- **Then** the matcher matches — these are now classified at request time, not in the regex **[matcher]**

## Built-in public routes

### The login page is reachable without a session

- **Given** a request without a session
- **When** `/login` is requested
- **Then** the proxy returns `next()` and does not redirect

### Auth.js routes are reachable without a session

- **Given** a request without a session
- **When** `/api/auth/callback/oidc` is requested
- **Then** the proxy returns `next()` and does not redirect

### The logout route is reachable without a session

- **Given** a request without a session
- **When** `/api/logout` is requested
- **Then** the proxy returns `next()` and does not redirect

### Built-in public routes match by prefix

- **Given** a request without a session
- **When** `/api/auth/session` is requested
- **Then** the proxy returns `next()`, because `/api/auth` is a built-in prefix route

### A path that merely starts with the same characters is still protected

- **Given** a request without a session
- **When** `/loginsomething` is requested
- **Then** the proxy redirects to `/login`, because prefix matching requires a `/` boundary

## Configured public routes — exact

### An exact entry matches its own path

- **Given** a proxy configured with `publicRoutes: { exact: ["/offline"] }` and a request without a session
- **When** `/offline` is requested
- **Then** the proxy returns `next()`

### An exact entry does not match a sub-path

- **Given** a proxy configured with `publicRoutes: { exact: ["/offline"] }` and a request without a session
- **When** `/offline/details` is requested
- **Then** the proxy redirects to `/login`

### An exact entry matches a file-like path

- **Given** a proxy configured with `publicRoutes: { exact: ["/sw.js", "/manifest.webmanifest"] }` and a request without a session
- **When** `/sw.js` is requested
- **Then** the proxy returns `next()`

## Configured public routes — prefix

### A prefix entry matches its own path

- **Given** a proxy configured with `publicRoutes: { prefix: ["/record-e2e"] }` and a request without a session
- **When** `/record-e2e` is requested
- **Then** the proxy returns `next()`

### A prefix entry matches a sub-path

- **Given** a proxy configured with `publicRoutes: { prefix: ["/record-e2e"] }` and a request without a session
- **When** `/record-e2e/step/2` is requested
- **Then** the proxy returns `next()`

### A prefix entry respects the path-segment boundary

- **Given** a proxy configured with `publicRoutes: { prefix: ["/record"] }` and a request without a session
- **When** `/recordings` is requested
- **Then** the proxy redirects to `/login`

### A configured prefix tolerates a trailing slash

- **Given** a proxy configured with `publicRoutes: { prefix: ["/record-e2e/"] }` and a request without a session
- **When** `/record-e2e/step/2` is requested
- **Then** the proxy returns `next()`, because trailing slashes are stripped during normalisation

### A requested path with a trailing slash matches its prefix

- **Given** a proxy configured with `publicRoutes: { prefix: ["/record-e2e"] }` and a request without a session
- **When** `/record-e2e/` is requested
- **Then** the proxy returns `next()`

### Exact and prefix entries combine

- **Given** a proxy configured with `publicRoutes: { exact: ["/offline"], prefix: ["/record-e2e"] }` and a request without a session
- **When** `/offline` and `/record-e2e/x` are requested
- **Then** both return `next()`, and `/offline/x` still redirects to `/login`

## Protected routes

### An unauthenticated request to a protected route is redirected

- **Given** a request without a session
- **When** `/admin/users` is requested
- **Then** the proxy redirects to `/login`

### The redirect carries the originally requested path

- **Given** a request without a session
- **When** `/admin/users` is requested
- **Then** the redirect target is `/login` with `callbackUrl` set to `/admin/users`

### The redirect preserves the query string

- **Given** a request without a session
- **When** `/admin/users?page=3` is requested
- **Then** `callbackUrl` is `/admin/users?page=3`

### `callbackUrl` is always relative

- **Given** a request without a session for any protected path
- **When** the redirect is produced
- **Then** `callbackUrl` is a path, never an absolute URL with a host — so it cannot become an open redirect

### An authenticated request passes through

- **Given** a request with a valid session (a `user` and no `error`)
- **When** `/admin/users` is requested
- **Then** the proxy returns `next()` and does not redirect

### An unknown path is protected, not public

- **Given** a request without a session
- **When** `/this/route/does/not/exist` is requested
- **Then** the proxy redirects to `/login` — classification fails closed

### A root request without a session is redirected

- **Given** a request without a session
- **When** `/` is requested
- **Then** the proxy redirects to `/login`

## Session error states

### A session with a refresh-token error is treated as unauthenticated

- **Given** a session whose `error` is `RefreshTokenError`
- **When** a protected route is requested
- **Then** the proxy redirects to `/login`, matching `isAuthorized`

### A session without a user is treated as unauthenticated

- **Given** a session object with no `user`
- **When** a protected route is requested
- **Then** the proxy redirects to `/login`

### A public route stays reachable even with a broken session

- **Given** a session whose `error` is `RefreshTokenError`
- **When** `/login` is requested
- **Then** the proxy returns `next()`, so the user can sign in again rather than being trapped in a redirect loop

## Configuration validation

### A route without a leading slash is rejected

- **Given** `publicRoutes: { exact: ["offline"] }`
- **When** `createAppLayerProxy` is called
- **Then** it throws, naming the offending entry

### A bare `/` prefix is rejected

- **Given** `publicRoutes: { prefix: ["/"] }`
- **When** `createAppLayerProxy` is called
- **Then** it throws, because it would make every route public

### A bare `/` is acceptable as an exact entry

- **Given** `publicRoutes: { exact: ["/"] }`
- **When** `createAppLayerProxy` is called
- **Then** it does not throw, and only `/` itself becomes public

### Validation happens once, at factory call time

- **Given** an invalid `publicRoutes` configuration
- **When** the module is evaluated
- **Then** the error surfaces at build or server start, not on the first request

### Omitted options are valid

- **Given** `createAppLayerProxy(auth)` with no options
- **When** a protected route is requested without a session
- **Then** the proxy redirects to `/login`, and only the built-in public routes bypass the check

### An empty `publicRoutes` object is valid

- **Given** `publicRoutes: {}`
- **When** `createAppLayerProxy` is called
- **Then** it behaves identically to omitting the option

## Public API surface

### `middlewareConfig` is gone

- **Given** a consumer importing `middlewareConfig` from `@open-elements/nextjs-app-layer/server`
- **When** the consumer is type-checked against the new version
- **Then** compilation fails with an unresolved-export error — the breaking change is loud, not silent

### No matcher constant is exported

- **Given** the public server surface
- **When** its exports are inspected
- **Then** no matcher string or config object is exported, so there is nothing a consumer can wrongly
  re-export into `config`

### The proxy factory is exported from the server entry point

- **Given** the package
- **When** `@open-elements/nextjs-app-layer/server` is imported
- **Then** `createAppLayerProxy` and its option types are available
