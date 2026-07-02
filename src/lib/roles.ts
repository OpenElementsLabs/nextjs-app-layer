import type { Session } from "next-auth";

export const ROLE_APP_ADMIN = "APP-ADMIN";
export const ROLE_APP_USER = "APP-USER";
export const ROLE_IT_ADMIN = "IT-ADMIN";

export function hasRole(session: Session | null | undefined, role: string): boolean {
  return !!session?.roles?.includes(role);
}
