#!/usr/bin/env node
/**
 * Guards the published ESM output against unresolvable relative specifiers.
 *
 * The package is `"type": "module"`, so Node resolves its internals with ESM
 * rules: no extension guessing, no directory indexes. `tsc` emits import
 * specifiers verbatim and never adds an extension, so an extension-less relative
 * import in `src/` becomes an unresolvable one in `dist/` — which is issue #9,
 * where 115 of them shipped for several releases.
 *
 * Why a build-time check rather than a compiler setting: `moduleResolution:
 * "nodenext"` would make `tsc` reject extension-less relative imports outright,
 * but it also resolves *dependencies* in ESM mode, where subpath resolution
 * requires an `exports` map — and `next` has none, so every `next/*` import stops
 * resolving. See `docs/specs/008-published-esm-resolution/design.md`.
 *
 * Deliberately not "import the package under Node": that can never pass. `next/link`,
 * `next/navigation`, `next/server` and `next-auth` are themselves unresolvable
 * under Node's ESM resolver, so the import fails upstream of anything this
 * package controls. This checks the half that is ours.
 *
 * Runs as `postbuild`, so it also gates `prepublishOnly`.
 */

import { readFileSync, existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";

const DIST = "dist";

/** `from "..."`, `import "..."` and `import("...")`, relative specifiers only. */
const RELATIVE_SPECIFIER = /(?:from\s*|import\s*\(?\s*)"(\.\.?\/[^"]*)"/g;

async function jsFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await jsFiles(path)));
    } else if (entry.name.endsWith(".js")) {
      found.push(path);
    }
  }
  return found;
}

if (!existsSync(DIST)) {
  console.error(`verify-esm-dist: ${DIST}/ does not exist — run the build first.`);
  process.exit(1);
}

const problems = [];
const files = await jsFiles(DIST);

for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const [, specifier] of source.matchAll(RELATIVE_SPECIFIER)) {
    if (!/\.(js|mjs|cjs|json|css)$/.test(specifier)) {
      problems.push(`${file}: "${specifier}" has no file extension`);
      continue;
    }
    // A present extension is not enough — it has to point at a real file.
    if (!existsSync(resolve(dirname(file), specifier))) {
      problems.push(`${file}: "${specifier}" does not resolve to a file`);
    }
  }
}

if (problems.length > 0) {
  console.error(
    `verify-esm-dist: ${problems.length} unresolvable relative specifier(s) in ${DIST}/.\n` +
      "Node resolves this package's internals with ESM rules: extensions are required\n" +
      "and are never added by tsc. Write them in the source import instead.\n",
  );
  for (const problem of problems.slice(0, 20)) {
    console.error(`  ${problem}`);
  }
  if (problems.length > 20) {
    console.error(`  … and ${problems.length - 20} more`);
  }
  process.exit(1);
}

console.log(`verify-esm-dist: ${files.length} files, every relative specifier resolves.`);
