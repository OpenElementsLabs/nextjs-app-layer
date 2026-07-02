# Implementation Steps: Canonical role constants

## Step 1: Fix role constants in `src/lib/roles.ts`

- [ ] Rename `ROLE_ADMIN` → `ROLE_APP_ADMIN` and set value to `"APP-ADMIN"`
- [ ] Add `ROLE_APP_USER = "APP-USER"`
- [ ] Keep `ROLE_IT_ADMIN = "IT-ADMIN"` and `hasRole()` exact-match unchanged

**Acceptance criteria:**
- [ ] Constants hold canonical values
- [ ] Project type-checks

**Related behaviors:** Role constant values

---

## Step 2: Update public export barrel `src/index.ts`

- [ ] Export `ROLE_APP_ADMIN, ROLE_APP_USER, ROLE_IT_ADMIN, hasRole`

**Acceptance criteria:**
- [ ] No dangling `ROLE_ADMIN` export

**Related behaviors:** Old admin constant name is no longer exported

---

## Step 3: Update tests `src/lib/__tests__/roles.test.ts`

- [ ] Assert new names/values, add `ROLE_APP_USER` coverage
- [ ] Add negative cases (legacy `"ADMIN"` claim, case-sensitivity)

**Acceptance criteria:**
- [ ] `pnpm test` passes

**Related behaviors:** hasRole happy paths, negatives and edge cases

---

## Step 4: Update `README.md`

- [ ] Update exported-symbols list
- [ ] Update "OE conventions" role-names line to `APP-ADMIN`, `APP-USER`, `IT-ADMIN`

**Acceptance criteria:**
- [ ] Docs match code

**Related behaviors:** —

---

## Step 5: Version bump

- [ ] Bump `package.json` version `0.5.0` → `0.6.0` (breaking change)

**Acceptance criteria:**
- [ ] Version reflects breaking change
