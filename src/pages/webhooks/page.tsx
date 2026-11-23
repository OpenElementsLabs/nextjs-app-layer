import type { Session } from "next-auth";
import { ForbiddenPage } from "../../components/forbidden-page.js";
import { ROLE_IT_ADMIN } from "../../lib/roles.js";
import { WebhooksClient } from "./webhooks-client.js";

type AuthFn = () => Promise<Session | null>;

export function createWebhooksPage({
  auth,
  homeRoute,
}: {
  readonly auth: AuthFn;
  readonly homeRoute?: string;
}) {
  return async function WebhooksPage() {
    const session = await auth();
    if (!session?.roles?.includes(ROLE_IT_ADMIN)) {
      return <ForbiddenPage homeRoute={homeRoute} />;
    }
    return <WebhooksClient />;
  };
}
