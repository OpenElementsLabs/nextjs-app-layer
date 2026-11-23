import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as proxyModule from "../proxy.js";

/**
 * Guards the public server surface after spec 002 removed `middlewareConfig`.
 *
 * The removal is the point: a matcher value that can be imported can also be
 * re-exported into `config`, where Next.js silently ignores it and falls back to
 * matching every request. Nothing matcher-shaped may reappear.
 *
 * `src/server.ts` itself cannot be imported here — it pulls in `next-auth`,
 * whose `lib/env.js` does a bare `next/server` import that does not resolve
 * under vitest's jsdom environment. Its export list is therefore asserted from
 * the source, which is where the surface is declared. That the removed export is
 * really gone is enforced by `pnpm run typecheck` and `pnpm run build`.
 */
// Resolved from the project root: under vitest's jsdom environment
// `import.meta.url` is not a `file:` URL, so it cannot be used here.
const serverEntryPoint = readFileSync(resolve(process.cwd(), "src/server.ts"), "utf8");

describe("public server surface", () => {
  it("exports the proxy factory", () => {
    expect(typeof proxyModule.createAppLayerProxy).toBe("function");
    expect(serverEntryPoint).toContain("createAppLayerProxy");
  });

  it("no longer exports middlewareConfig", () => {
    expect(serverEntryPoint).not.toContain("middlewareConfig");
    expect("middlewareConfig" in proxyModule).toBe(false);
  });

  it("exports nothing matcher-shaped from the proxy module", () => {
    for (const [name, value] of Object.entries(proxyModule)) {
      expect(name.toLowerCase()).not.toContain("matcher");
      if (typeof value === "object" && value !== null) {
        expect(value).not.toHaveProperty("matcher");
      }
    }
  });

  it("declares no matcher-shaped export at the entry point", () => {
    expect(serverEntryPoint.toLowerCase()).not.toContain("matcher");
  });

  it("keeps the rest of the server surface declared", () => {
    for (const name of ["createAppLayerAuth", "createBackendProxyHandler", "createLogoutHandler"]) {
      expect(serverEntryPoint).toContain(name);
    }
  });
});
