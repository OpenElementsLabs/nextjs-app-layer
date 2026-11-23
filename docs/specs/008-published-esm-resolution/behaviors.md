# Behaviors: Resolvable relative specifiers in the published ESM output

These are properties of the build output rather than runtime behaviour. Each names the command that
verifies it; `scripts/verify-esm-dist.mjs` runs as `postbuild`, so most are checked on every build.

## The published output

### Every relative specifier in `dist/` carries a file extension

- **Given** a completed `pnpm run build`
- **When** `dist/` is scanned for relative import, export and dynamic-import specifiers
- **Then** every one ends in `.js` (or `.json`/`.css`) — Node resolves this package's internals with
  ESM rules and never guesses an extension

### Every relative specifier in `dist/` points at a file that exists

- **Given** a completed build
- **When** each relative specifier is resolved against its containing file
- **Then** the target file exists — a present but wrong extension is as broken as a missing one

### The failure reported in #9 no longer originates in this package

- **Given** the built `dist/`
- **When** `dist/index.js` is imported under plain Node
- **Then** it no longer fails on `dist/lib/roles`. It still fails, on `next/link`, which is upstream:
  `next` ships no `exports` map and Node will not fall back to a physical file for a bare subpath

## The guard

### A missing extension fails the build

- **Given** a relative import in `src/` from which the `.js` extension has been removed
- **When** `pnpm run build` runs
- **Then** it exits non-zero, naming the file and the specifier — verified by doing exactly that to
  `src/index.ts`

### The guard runs before publishing

- **Given** `prepublishOnly`, which runs `pnpm run build`
- **When** a publish is attempted with a broken specifier
- **Then** the build, and therefore the publish, fails first

### No separate CI step is needed

- **Given** the `verify` job, which already runs `pnpm run build`
- **When** CI runs
- **Then** the guard runs with it — the invariant is enforced without widening the workflow

## Nothing else changed

### The unit tests are unaffected

- **Given** the rewritten specifiers
- **When** `pnpm run test` runs
- **Then** all 156 tests pass — Vite resolves `.js` specifiers to their `.ts` sources

### The end-to-end suite is unaffected

- **Given** the rewritten specifiers
- **When** the E2E suite runs
- **Then** all 65 tests pass in all four projects. The fixture app consumes `dist/` through the
  workspace link, so this exercises the rewritten output in a real Next.js production build

### The public API is unchanged

- **Given** the package's entry points
- **When** the exports map and the published file list are inspected
- **Then** they are unchanged — only the spelling of internal specifiers differs

### No path alias can reintroduce the problem

- **Given** `tsconfig.json`
- **When** its `compilerOptions` are inspected
- **Then** `baseUrl` and `paths` are absent, so an `@/foo` import cannot type-check and then emit an
  unresolvable specifier
