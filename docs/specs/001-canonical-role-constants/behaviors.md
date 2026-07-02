# Behaviors: Canonical role constants

## Role constant values

### Admin role constant holds the canonical value

- **Given** the `@open-elements/nextjs-app-layer` public API
- **When** `ROLE_APP_ADMIN` is read
- **Then** it equals the string `"APP-ADMIN"`

### App-user role constant is exported

- **Given** the public API
- **When** `ROLE_APP_USER` is read
- **Then** it equals the string `"APP-USER"`

### IT-admin role constant is unchanged

- **Given** the public API
- **When** `ROLE_IT_ADMIN` is read
- **Then** it equals the string `"IT-ADMIN"`

### Old admin constant name is no longer exported

- **Given** the public API after this change
- **When** a consumer imports `ROLE_ADMIN`
- **Then** the symbol does not exist (compile-time error / `undefined` at
  runtime), forcing migration to `ROLE_APP_ADMIN`

## hasRole — happy paths

### Real admin passes the admin check

- **Given** a session with `roles = ["APP-ADMIN", "APP-USER", "IT-ADMIN"]`
- **When** `hasRole(session, ROLE_APP_ADMIN)` is called
- **Then** it returns `true`

### App user passes the app-user check

- **Given** a session with `roles = ["APP-USER"]`
- **When** `hasRole(session, ROLE_APP_USER)` is called
- **Then** it returns `true`

### IT admin passes the IT-admin check

- **Given** a session with `roles = ["IT-ADMIN"]`
- **When** `hasRole(session, ROLE_IT_ADMIN)` is called
- **Then** it returns `true`

## hasRole — negative and edge cases

### User without the role fails the check

- **Given** a session with `roles = ["APP-USER"]`
- **When** `hasRole(session, ROLE_APP_ADMIN)` is called
- **Then** it returns `false`

### Legacy "ADMIN" claim no longer grants admin (intentional breakage)

- **Given** a session with `roles = ["ADMIN"]` (the old, pre-fix claim value)
- **When** `hasRole(session, ROLE_APP_ADMIN)` is called
- **Then** it returns `false`, because the match is exact and `"ADMIN"` is not
  the canonical `"APP-ADMIN"`

### Matching is case-sensitive

- **Given** a session with `roles = ["app-admin"]`
- **When** `hasRole(session, ROLE_APP_ADMIN)` is called
- **Then** it returns `false` (exact, case-sensitive match is preserved)

### Empty roles array

- **Given** a session with `roles = []`
- **When** `hasRole(session, ROLE_APP_ADMIN)` is called
- **Then** it returns `false`

### Null session

- **Given** a `null` session
- **When** `hasRole(null, ROLE_APP_ADMIN)` is called
- **Then** it returns `false`

### Undefined session

- **Given** an `undefined` session
- **When** `hasRole(undefined, ROLE_APP_ADMIN)` is called
- **Then** it returns `false`

### Session with no roles property

- **Given** a session object where `roles` is `undefined`
- **When** `hasRole(session, ROLE_APP_ADMIN)` is called
- **Then** it returns `false` (no throw)

## Session claim mapping (unchanged, regression guard)

### OIDC roles claim is carried through 1:1

- **Given** an OIDC `roles` claim of `["APP-ADMIN", "APP-USER", "IT-ADMIN"]`
- **When** the session is built by `createAppLayerAuth`
- **Then** `session.roles` equals `["APP-ADMIN", "APP-USER", "IT-ADMIN"]`
  (values passed through without transformation)

### Missing roles claim yields an empty array

- **Given** an OIDC profile with no `roles` claim
- **When** the session is built
- **Then** `session.roles` equals `[]` (not `undefined`)
