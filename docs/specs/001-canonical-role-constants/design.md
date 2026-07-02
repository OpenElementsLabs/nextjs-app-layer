# Design: Canonical role constants

## GitHub Issue

[#3 — ROLE_ADMIN constant is "ADMIN" but the canonical app-admin role is "APP-ADMIN" (frontend/backend mismatch)](https://github.com/OpenElementsLabs/nextjs-app-layer/issues/3)

## Summary

The role constants exported from `src/lib/roles.ts` do not match the canonical
role names used across the Open Elements ecosystem. `ROLE_ADMIN` resolves to
the string `"ADMIN"`, but the admin role issued by the OIDC provider and
enforced by the backend is `"APP-ADMIN"` (backend authority `ROLE_APP-ADMIN`
via the shared `spring-services` `@RequiresAppAdmin`).

Because `hasRole()` performs an exact, case-sensitive match, any downstream app
calling `hasRole(session, ROLE_ADMIN)` to gate admin UI gets `false` even for
real admins — admin-only controls stay hidden. This fixes the constant values,
aligns the constant naming to a consistent `APP_`/`IT_` prefix scheme, and adds
the missing `APP-USER` role constant. It is a **breaking change** to the public
API and warrants a version bump.

## Reproduction

- **Given** an OIDC provider that issues the roles claim `["APP-ADMIN", "APP-USER", "IT-ADMIN"]`
- **And** a downstream app that gates admin UI with `hasRole(session, ROLE_ADMIN)`
- **When** a real admin (holding `APP-ADMIN`) signs in
- **Then** `session.roles` contains `"APP-ADMIN"` (copied 1:1 from the JWT), but
  `ROLE_ADMIN === "ADMIN"`, so `session.roles.includes("ADMIN")` is `false`
- **Result:** admin-only UI (e.g. delete buttons) stays disabled/hidden even
  though the backend correctly authorizes the same user.

## Root cause analysis

The bug is a **wrong constant value**, not a logic error.

- `src/lib/roles.ts` declares `export const ROLE_ADMIN = "ADMIN";` — the string
  literal `"ADMIN"` never matches the canonical `"APP-ADMIN"` role name.
- `hasRole()` is correct: `session?.roles?.includes(role)` is an exact match,
  and roles line up exactly once the constant holds the right value. No
  normalization is needed.
- `src/server/auth.ts` copies the OIDC `roles` claim into `session.roles`
  unchanged — also correct; the session carries the true role strings.

The frontend was simply the outlier: the IdP, `session.roles`, and the backend
all agree on `"APP-ADMIN"`; only this library's constant disagreed.

Note: `ROLE_ADMIN` is **not used internally** anywhere in this library — every
admin page (`users`, `audit-logs`, `status`, `token`, `api-keys`, `webhooks`)
gates on `ROLE_IT_ADMIN`. `ROLE_ADMIN` is only re-exported from `src/index.ts`
for downstream consumers, so the practical breakage is entirely downstream.

## Fix approach

Correct the canonical role strings and align the constant names to a consistent
prefix scheme. `ROLE_IT_ADMIN` already held the correct value `"IT-ADMIN"` and
keeps it.

`src/lib/roles.ts`:

```ts
export const ROLE_APP_ADMIN = "APP-ADMIN";
export const ROLE_APP_USER = "APP-USER";
export const ROLE_IT_ADMIN = "IT-ADMIN";

export function hasRole(session: Session | null | undefined, role: string): boolean {
  return !!session?.roles?.includes(role);
}
```

Changes:

1. **Rename** `ROLE_ADMIN` → `ROLE_APP_ADMIN` and **fix its value** from
   `"ADMIN"` to `"APP-ADMIN"`.
2. **Add** `ROLE_APP_USER = "APP-USER"` (the third supported role, previously
   missing).
3. **Keep** `ROLE_IT_ADMIN = "IT-ADMIN"` unchanged.
4. **Keep** `hasRole()` as an exact, case-sensitive `includes()` match. Roles
   now match the claim exactly, so no normalization is introduced (it would
   only mask future mismatches).

Update the public export barrel `src/index.ts`:

```ts
export { ROLE_APP_ADMIN, ROLE_APP_USER, ROLE_IT_ADMIN, hasRole } from "./lib/roles";
```

Update the test `src/lib/__tests__/roles.test.ts` to assert the new names and
values, and add coverage for `ROLE_APP_USER`.

Update documentation in `README.md`:

- The exported-symbols list (currently `ROLE_ADMIN, ROLE_IT_ADMIN, hasRole`).
- The "OE conventions this lib assumes" line (currently
  `OIDC role names: IT-ADMIN and ADMIN (hardcoded)`) to reflect
  `APP-ADMIN`, `APP-USER`, and `IT-ADMIN`.

**Rationale for the naming decision:** since the fix is already a breaking
change (the `ROLE_ADMIN` value changes), it is the right moment to also rename
the constant so all three exports follow the same `<AREA>_<ROLE>` convention
(`ROLE_APP_ADMIN`, `ROLE_APP_USER`, `ROLE_IT_ADMIN`). This mirrors the actual
role strings (`APP-`/`IT-` prefixes) and removes the mismatch between a bare
`ROLE_ADMIN` name and an `"APP-ADMIN"` value.

**Rationale for keeping `hasRole()` exact:** the OIDC IdP, `session.roles`, and
the backend all use the exact canonical strings. An exact match keeps the
contract simple and surfaces any real future mismatch loudly instead of
silently coercing it.

## Versioning

This is a **breaking change** to the public API:

- `ROLE_ADMIN` is removed (renamed to `ROLE_APP_ADMIN`), so any consumer
  importing `ROLE_ADMIN` will fail to compile.
- The value of the admin role constant changes from `"ADMIN"` to `"APP-ADMIN"`,
  breaking anyone who still issues an `"ADMIN"` claim to match the old value.

Recommendation: bump the package from `0.5.0` to **`0.6.0`** (minor bump on a
pre-1.0 line signals a breaking change per this project's convention) and add a
clear changelog / release note describing the rename and the new value, with a
migration hint (`ROLE_ADMIN` → `ROLE_APP_ADMIN`, ensure the IdP issues
`APP-ADMIN`). A release/upgrade note can be produced with `/release-doc`.

## Non-goals

- **Configurable / per-app role mapping** — remains deferred follow-up work (see
  README "Deferred follow-up work"). This spec keeps role names hardcoded.
- **Changing `hasRole()` semantics** (case-insensitivity, prefix stripping,
  `ROLE_`-authority handling) — explicitly out of scope.
- **Transforming the roles claim in `src/server/auth.ts`** — the claim is
  already carried through correctly.

## Regression risk

- **Internal:** low. `ROLE_ADMIN` is unused internally; admin pages use
  `ROLE_IT_ADMIN`, which is unchanged. No internal call sites depend on the old
  admin value.
- **Downstream:** intentional breakage. Consumers importing `ROLE_ADMIN` must
  rename to `ROLE_APP_ADMIN`; consumers relying on the `"ADMIN"` string must
  update their IdP role claim to `"APP-ADMIN"`. This is the point of the fix and
  is communicated via the version bump + changelog.
- **Tests:** `roles.test.ts` hard-codes the old name/value and must be updated
  in the same change, or the build fails.

## Open questions

None. Supported roles confirmed via issue #3 comment: `APP-ADMIN`, `IT-ADMIN`,
`APP-USER`. `IT-ADMIN` intentionally has no `APP-` prefix.
