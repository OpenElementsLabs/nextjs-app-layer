# Upgrade prompt: `@open-elements/nextjs-app-layer` 0.5.x → 0.6.0

## Prompt

You are upgrading a Next.js app that depends on `@open-elements/nextjs-app-layer` from 0.5.x to 0.6.0. This upgrade has **one mandatory breaking change** (the admin role constant was renamed and its value corrected) and **one optional addition** (`ROLE_APP_USER`). It may also require a **configuration change on the OIDC provider side** if your IdP was issuing the old `"ADMIN"` role string. Apply the mandatory changes, verify the IdP claim, then decide on the optional one. Do not change anything outside this scope.

### What changed in 0.6.0

#### Dependencies

Bump only `@open-elements/nextjs-app-layer` to `0.6.0`. No peer dependencies changed: `next`, `next-auth`, `react`, `react-dom`, `lucide-react`, and `@open-elements/ui` stay at whatever versions the consumer already uses. Do **not** change those coordinates as part of this upgrade.

#### Breaking: `ROLE_ADMIN` renamed to `ROLE_APP_ADMIN`, value corrected to `"APP-ADMIN"`

The exported admin role constant was both **renamed** and had its **string value corrected**. In 0.5.x it was `ROLE_ADMIN = "ADMIN"`, which never matched the canonical admin role issued by the OIDC provider and enforced by the backend (`spring-services` `@RequiresAppAdmin` → authority `ROLE_APP-ADMIN`). As a result, `hasRole(session, ROLE_ADMIN)` returned `false` for real admins and admin-only UI stayed hidden.

```ts
// 0.5.x
import { ROLE_ADMIN, hasRole } from "@open-elements/nextjs-app-layer";
export const ROLE_ADMIN = "ADMIN"; // wrong value

const canDelete = hasRole(session, ROLE_ADMIN); // always false for real admins

// 0.6.0
import { ROLE_APP_ADMIN, hasRole } from "@open-elements/nextjs-app-layer";
export const ROLE_APP_ADMIN = "APP-ADMIN"; // canonical value

const canDelete = hasRole(session, ROLE_APP_ADMIN); // works
```

Two things break for a consumer:

1. **The import name.** Any `import { ROLE_ADMIN }` fails to compile — the symbol no longer exists. Rename it to `ROLE_APP_ADMIN`.
2. **The role string.** If your OIDC provider was configured to issue `"ADMIN"` to match the old constant, that claim will no longer match. The IdP must issue `"APP-ADMIN"` (the canonical name already used by the backend). This is a **provider-side configuration change**, not a code change — verify it before deploying.

`hasRole()` itself is unchanged: same signature `(session, role) => boolean` and the same exact, case-sensitive match. Nothing about how you call it changes beyond the constant you pass.

#### Additive: `ROLE_APP_USER` for the standard app-user role

Adoption is **strictly optional**. 0.6.0 adds a constant for the standard non-admin application role:

```ts
import { ROLE_APP_USER, hasRole } from "@open-elements/nextjs-app-layer";
export const ROLE_APP_USER = "APP-USER";

const isAppUser = hasRole(session, ROLE_APP_USER);
```

If your app does not need to gate anything on the app-user role, skip this — existing behavior is unchanged and no action is required.

#### Unchanged: `ROLE_IT_ADMIN`

`ROLE_IT_ADMIN = "IT-ADMIN"` is unchanged in both name and value. It intentionally has **no** `APP-` prefix. Any existing `hasRole(session, ROLE_IT_ADMIN)` call sites and the library's own admin pages (which gate on `ROLE_IT_ADMIN`) keep working without changes.

### Steps

1. Bump `@open-elements/nextjs-app-layer` to `0.6.0` in `package.json`; leave all other dependencies untouched. Reinstall (`pnpm install`).
2. Find every usage of `ROLE_ADMIN` (imports and call sites) and rename to `ROLE_APP_ADMIN`. A project-wide search for `ROLE_ADMIN` should return zero matches afterward (careful not to rename `ROLE_IT_ADMIN`).
3. Verify the OIDC provider issues `"APP-ADMIN"` in the `roles` claim for admin users. If it was configured to issue `"ADMIN"` for this app, update the provider's role mapping to `"APP-ADMIN"`.
4. (Optional) Adopt `ROLE_APP_USER` where you need to gate app-user-only UI.
5. Fix any test that asserts on the old `ROLE_ADMIN` name or the `"ADMIN"` string value.
6. Run type-check, build, and the test suite; confirm green before committing.

### Guard rails

- Do **not** keep a local `const ROLE_ADMIN = "ADMIN"` shim to avoid renaming call sites — the point of the fix is that `"ADMIN"` never matched the real claim.
- Do **not** rename `ROLE_IT_ADMIN` or change its value — only the admin constant changed.
- Do **not** change `hasRole()` call patterns or wrap it in case-insensitive matching; the match is exact by design and roles now line up exactly.
- Do **not** bump `next`, `next-auth`, `react`, `@open-elements/ui`, or any other dependency in the same change.

### Don't do this

- Do not re-export `ROLE_APP_ADMIN` under the old name `ROLE_ADMIN` "for compatibility" — that reintroduces the misleading name this release removed.
- Do not skip the OIDC provider check assuming it "already works" — an app that was issuing `"ADMIN"` will silently deny admins until the claim is corrected.
- Do not bundle this upgrade with unrelated feature work in the same PR.
