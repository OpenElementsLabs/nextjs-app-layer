import { describe, it, expect } from "vitest";
import { ROLE_APP_ADMIN, ROLE_APP_USER, ROLE_IT_ADMIN, hasRole } from "../roles";

describe("roles", () => {
  it("exposes the canonical OE role names", () => {
    expect(ROLE_APP_ADMIN).toBe("APP-ADMIN");
    expect(ROLE_APP_USER).toBe("APP-USER");
    expect(ROLE_IT_ADMIN).toBe("IT-ADMIN");
  });

  it("hasRole returns true when the session has the app-admin role", () => {
    // @ts-expect-error — minimal session shape for the test
    expect(hasRole({ roles: ["APP-ADMIN", "APP-USER", "IT-ADMIN"] }, ROLE_APP_ADMIN)).toBe(true);
  });

  it("hasRole returns true when the session has the app-user role", () => {
    // @ts-expect-error — minimal session shape for the test
    expect(hasRole({ roles: ["APP-USER"] }, ROLE_APP_USER)).toBe(true);
  });

  it("hasRole returns true when the session has the it-admin role", () => {
    // @ts-expect-error — minimal session shape for the test
    expect(hasRole({ roles: ["IT-ADMIN"] }, ROLE_IT_ADMIN)).toBe(true);
  });

  it("hasRole returns false when the session lacks the role", () => {
    // @ts-expect-error — minimal session shape for the test
    expect(hasRole({ roles: ["APP-USER"] }, ROLE_APP_ADMIN)).toBe(false);
  });

  it("hasRole returns false for the legacy 'ADMIN' claim (intentional breakage)", () => {
    // @ts-expect-error — minimal session shape for the test
    expect(hasRole({ roles: ["ADMIN"] }, ROLE_APP_ADMIN)).toBe(false);
  });

  it("hasRole matches case-sensitively", () => {
    // @ts-expect-error — minimal session shape for the test
    expect(hasRole({ roles: ["app-admin"] }, ROLE_APP_ADMIN)).toBe(false);
  });

  it("hasRole returns false for an empty roles array", () => {
    // @ts-expect-error — minimal session shape for the test
    expect(hasRole({ roles: [] }, ROLE_APP_ADMIN)).toBe(false);
  });

  it("hasRole returns false when the session has no roles property", () => {
    // @ts-expect-error — minimal session shape for the test
    expect(hasRole({}, ROLE_APP_ADMIN)).toBe(false);
  });

  it("hasRole returns false for null/undefined session", () => {
    expect(hasRole(null, ROLE_APP_ADMIN)).toBe(false);
    expect(hasRole(undefined, ROLE_APP_ADMIN)).toBe(false);
  });
});
