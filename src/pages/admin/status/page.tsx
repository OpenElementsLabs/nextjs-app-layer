import type { Session } from "next-auth";
import { ForbiddenPage } from "../../../components/forbidden-page";
import { ROLE_IT_ADMIN } from "../../../lib/roles";
import { ServerStatusClient, type StatusCapabilitiesConfig } from "./server-status-client";

type AuthFn = () => Promise<Session | null>;

export function createServerStatusPage({
  auth,
  homeRoute,
  capabilities,
}: {
  readonly auth: AuthFn;
  readonly homeRoute?: string;
  readonly capabilities?: StatusCapabilitiesConfig;
}) {
  return async function ServerStatusPage() {
    const session = await auth();
    if (!session?.roles?.includes(ROLE_IT_ADMIN)) {
      return <ForbiddenPage homeRoute={homeRoute} />;
    }
    return <ServerStatusClient capabilities={capabilities} />;
  };
}
