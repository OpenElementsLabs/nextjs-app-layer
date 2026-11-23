# Design: Resolvable relative specifiers in the published ESM output

## GitHub Issue

[#9 — Published ESM does not resolve under Node: 124 extension-less relative imports in dist/](https://github.com/OpenElementsLabs/nextjs-app-layer/issues/9)

## Summary

The package is `"type": "module"`, so Node resolves its internals with ESM rules: extensions are
required and are never guessed. `tsc` emits import specifiers verbatim and never adds one, so every
extension-less relative import in `src/` became an unresolvable specifier in `dist/`. There were 115
of them in the current build, and they have shipped since at least 0.7.0.

All 136 relative specifiers in `src/` now carry a `.js` extension, so `dist/` contains none, and a
build-time guard keeps it that way.

## The issue's goal is only half reachable, and that matters

#9 frames success as `node -e 'import("@open-elements/nextjs-app-layer")'` succeeding. **It cannot.**
Measured under plain Node ESM:

| Module | Resolves |
|---|---|
| `@open-elements/ui` | yes |
| `next/link` | **no** |
| `next/navigation` | **no** |
| `next/server` | **no** |
| `next-auth` | **no** |

`next` ships no `exports` map at all, and Node's ESM resolver will not fall back to a physical
`next/link.js` for a bare subpath. So the import fails upstream of anything this package controls, no
matter how its own specifiers are written.

What the fix does achieve is measurable and worth having: the failure moved out of our code. Before,
the first error was

```
Cannot find module '.../dist/lib/roles' imported from '.../dist/index.js'
```

and now it is

```
Cannot find module '.../node_modules/next/link' imported from '.../dist/components/forbidden-page.js'
```

The half we own is correct; the remaining blocker is Next.js, recorded in `docs/TODO.md`. That also
means #9 should be closed with this finding rather than left to imply a reachable goal — or kept open
scoped to the upstream half, but not silently.

## Fix approach

The issue proposes three options and recommends **Option 2** — `.js` specifiers plus
`moduleResolution: "nodenext"` — because the compiler then *enforces* the invariant rather than
relying on convention. That reasoning is right, and it is the option this spec tried first.

**It does not work here.** `nodenext` resolves dependencies in ESM mode, where subpath resolution
requires an `exports` map. `next` has none, so `next/link`, `next/server`, `next/navigation` and
`next/experimental/testing/server` all stop resolving and the type-check fails with 10
`TS2307`s. The resolution trace is unambiguous:

```
Resolving in ESM mode with conditions 'import', 'types', 'node'.
Found 'package.json' at '.../node_modules/next/package.json'.
'package.json' does not have a 'typesVersions' field.
======== Module name 'next/server' was not resolved. ========
```

Note what this is *not*: it is not the extension-less import inside Next's own `link.d.ts`, which was
the obvious guess. TypeScript never gets that far.

So **Option 1** is taken — `.js` specifiers in source, `moduleResolution` kept at `"bundler"` — which
also matches how `@open-elements/ui` builds. The enforcement Option 2 would have given is supplied
instead by a build-time guard, which is stricter in one respect: it checks the *output*, so it also
catches a specifier whose extension is present but wrong.

### Changes

- All 136 relative specifiers in `src/` carry `.js`, including dynamic `import("…")` calls in tests.
  TypeScript maps `.js` → `.ts`/`.tsx` when resolving, so the source still refers to real files.
- `baseUrl` and `paths` (`@/*`) are removed from `tsconfig.json`. They were unused in `src/` and are a
  hole of exactly the same shape: `@/foo` would type-check and emit an unresolvable specifier. The
  fixture app keeps its own `tsconfig.json` with its own `paths`.
- `scripts/verify-esm-dist.mjs` scans `dist/` for relative specifiers that lack an extension or do not
  resolve to a file, and fails the build with the offending file and specifier named.
- It runs as `postbuild`, so it gates `pnpm run build`, `pnpm e2e` and — the one that matters —
  `prepublishOnly`. No CI change is needed: the `verify` job already runs `pnpm run build`.

### Why the guard checks output rather than importing the package

"Import the package under Node" is the check #9 suggests, and it is the obvious one. It can never
pass, for the upstream reason above, so it would have to be written to tolerate a `next/*` failure —
at which point it no longer distinguishes our defect from theirs. Scanning the output is narrower,
deterministic, and tests exactly the invariant we can hold.

## Regression risk

Low and well covered. Nothing about the package's public API, exports map or runtime behaviour
changes — only the spelling of internal specifiers.

- The guard was verified to fail: removing one `.js` from `src/index.ts` produced
  `dist/index.js: "./lib/roles" has no file extension` and a non-zero exit.
- 156 unit tests pass — Vitest resolves `.js` specifiers to the `.ts` sources through Vite's
  resolver, so the test suite is unaffected.
- 65 E2E tests pass in all four projects. The fixture app consumes `dist/` through the workspace
  link, so this exercises the rewritten output in a real Next.js build.

The one thing to watch is a contributor adding an extension-less import in a new file. The compiler
will not complain under `bundler` resolution — the guard will, at build time, which is before
publish.

## Open questions

- Whether to revisit `nodenext` if Next.js ever ships an `exports` map. The source is now in the
  shape `nodenext` wants, so the switch would be a two-line tsconfig change plus deleting the guard.
