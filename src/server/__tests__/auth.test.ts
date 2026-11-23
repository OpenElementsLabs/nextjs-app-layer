import { describe, it, expect, vi } from "vitest";

/**
 * `createAppLayerAuth` hands its configuration to `NextAuth` and does not return
 * it, so the object is otherwise unobservable. Only that one call is replaced —
 * everything inside `createAppLayerAuth` runs for real.
 */
const captured = vi.hoisted(() => ({ config: undefined as Record<string, unknown> | undefined }));

vi.mock("next-auth", () => ({
  default: (config: Record<string, unknown>) => {
    captured.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));

const { createAppLayerAuth } = await import("../auth");

function configure(): Record<string, unknown> {
  createAppLayerAuth({
    issuer: "https://idp.example.test",
    clientId: "client-id",
    clientSecret: "client-secret",
  });
  if (captured.config === undefined) {
    throw new Error("NextAuth was not called");
  }
  return captured.config;
}

describe("createAppLayerAuth pages", () => {
  it("routes auth errors to the login page instead of the built-in error page", () => {
    // Without this, an interrupted or superseded login lands on
    // /api/auth/error, which claims a server configuration problem and offers no
    // way back. See spec 005 / #16.
    expect(configure().pages).toEqual({ signIn: "/login", error: "/login" });
  });
});

describe("createAppLayerAuth provider", () => {
  it("leaves the PKCE check in place", () => {
    // The fix for #16 changes how a failure is *presented*. Weakening or
    // disabling the check itself was explicitly out of scope, so this pins it:
    // `checks` must not be overridden away from the OIDC default of ["pkce"].
    const providers = configure().providers as ReadonlyArray<Record<string, unknown>>;
    const oidc = providers[0];

    expect(oidc.id).toBe("oidc");
    expect(oidc.type).toBe("oidc");
    if (oidc.checks !== undefined) {
      expect(oidc.checks).toContain("pkce");
    }
  });

  it("requests the scopes the app layer depends on", () => {
    const providers = configure().providers as ReadonlyArray<Record<string, unknown>>;
    const authorization = providers[0].authorization as { params: { scope: string } };

    for (const scope of ["openid", "profile", "email", "offline_access", "roles"]) {
      expect(authorization.params.scope).toContain(scope);
    }
  });
});
