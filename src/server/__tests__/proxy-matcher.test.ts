import { describe, it, expect } from "vitest";
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
 * Keep in sync with the README's wiring section.
 */
const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.ico$).*)",
  ],
};

function matches(url: string): boolean {
  return unstable_doesMiddlewareMatch({ config, url });
}

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
