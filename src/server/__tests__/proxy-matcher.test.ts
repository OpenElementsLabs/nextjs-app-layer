import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

/**
 * The canonical coarse matcher that consuming apps copy into their own
 * `middleware.ts` / `proxy.ts`.
 *
 * It is a literal here, not an import from the library, because that is exactly
 * how consumers must write it: Next.js extracts `config.matcher` from the AST of
 * the middleware file itself and silently falls back to matching every request
 * when it finds no literal declaration. Publishing an importable value would
 * only invite `export const config = { matcher: imported }`, which fails the
 * same silent way. So the string is documentation — and this suite is what keeps
 * the documented string honest.
 *
 * The copies in the README and the upgrade guide are the ones consumers actually
 * paste, so they are asserted against this one below rather than merely kept in
 * sync by hand.
 */
const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.ico$).*)",
  ],
};

function matches(url: string): boolean {
  return unstable_doesMiddlewareMatch({ config, url });
}

/** Documents that publish the matcher for consumers to copy. */
const DOCUMENTED_IN = ["README.md", "docs/releases/upgrade-to-0.10.md"];

/** Any double-quoted string that opens like a negative-lookahead matcher. */
const QUOTED_MATCHER = /"\/\(\(\?![^"]*"/g;

describe("canonical coarse matcher", () => {
  it("matches application routes, so the proxy runs for them", () => {
    expect(matches("/")).toBe(true);
  });

  it("matches nested application routes", () => {
    expect(matches("/admin/users")).toBe(true);
  });

  it("does not match Next.js static chunks", () => {
    expect(matches("/_next/static/chunks/main.js")).toBe(false);
  });

  it("does not match the image optimization endpoint", () => {
    expect(matches("/_next/image")).toBe(false);
  });

  it("does not match the favicon", () => {
    expect(matches("/favicon.ico")).toBe(false);
  });

  it("does not match robots.txt, so crawlers can read it unauthenticated", () => {
    expect(matches("/robots.txt")).toBe(false);
  });

  it("does not match sitemap.xml, so crawlers can read it unauthenticated", () => {
    expect(matches("/sitemap.xml")).toBe(false);
  });

  it("still protects the crawler file names outside the site root", () => {
    // The negative lookahead is anchored at the start of the path, so only the
    // well-known locations are public — not an arbitrary nested route that
    // happens to end in the same name.
    expect(matches("/reports/robots.txt")).toBe(true);
    expect(matches("/reports/sitemap.xml")).toBe(true);
  });

  it("still protects other XML and text resources", () => {
    expect(matches("/api/export.xml")).toBe(true);
    expect(matches("/notes.txt")).toBe(true);
  });

  it.each([
    "/oe-logo-landscape-dark.svg",
    "/screenshot.png",
    "/photo.jpg",
    "/apple-touch-icon.ico",
  ])("does not match the asset %s", (url) => {
    expect(matches(url)).toBe(false);
  });

  it("matches backend proxy routes, keeping them behind the auth check", () => {
    // Deliberate divergence from the Next.js and Auth.js documented examples,
    // which exclude `/api` wholesale: `createBackendProxyHandler` is mounted
    // under `/api/*` and must stay gated.
    expect(matches("/api/users")).toBe(true);
  });

  it("matches the auth routes, which are now classified at request time", () => {
    expect(matches("/api/auth/signin")).toBe(true);
    expect(matches("/api/logout")).toBe(true);
    expect(matches("/login")).toBe(true);
  });
});

/**
 * Pins the documented copies to the tested one.
 *
 * Without this, the only verified copy of the matcher would be the literal in
 * this file, while the copies consumers paste live in the docs. A wrong
 * character in a README edit would ship a broken matcher with every test still
 * green — the same silent failure this spec exists to remove, one level up.
 */
describe("documented copies of the matcher", () => {
  // `JSON.stringify` reproduces the TypeScript source form of the string,
  // including the doubled backslashes, which is what the docs contain.
  const sourceForm = JSON.stringify(config.matcher[0]);

  it.each(DOCUMENTED_IN)("publishes only the tested matcher in %s", (file) => {
    const text = readFileSync(resolve(process.cwd(), file), "utf8");
    const quoted = text.match(QUOTED_MATCHER) ?? [];

    expect(quoted.length).toBeGreaterThan(0);
    for (const occurrence of quoted) {
      expect(occurrence).toBe(sourceForm);
    }
  });
});
