# Spec Index

| ID  | Spec-Folder | Name | Areas | Description | GitHub Issue | Status |
|-----|-------------|------|-------|-------------|--------------|--------|
| 001 | 001-canonical-role-constants | Canonical role constants | frontend, authentication, api | Fix `ROLE_ADMIN` value to `APP-ADMIN`, rename to `ROLE_APP_ADMIN`, add `ROLE_APP_USER`; align role constants to canonical OIDC names (breaking) | #3 | done |
| 002 | 002-app-layer-proxy-api | App-layer proxy factory API | frontend, authentication, api, security | Replace the hand-copied middleware matcher with `createAppLayerProxy`: app routes become a `publicRoutes` option filtered at request time, only a stable static-asset matcher stays copied, `middlewareConfig` is removed (breaking) | — | in progress |
