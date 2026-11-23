import { createLogoutHandler } from "@open-elements/nextjs-app-layer/server";
import { auth } from "@/auth";

/**
 * The same handler against an issuer whose discovery document cannot be fetched,
 * so the handler's deliberate `catch {}` fallback to `/login` is reachable.
 *
 * A second route rather than a second compose service: the issuer is otherwise
 * process-wide configuration, and this exercises one `catch` branch. Port 9 is
 * the discard port — nothing listens there, by definition.
 */
const handler = createLogoutHandler({
  auth,
  oidcIssuer: "http://localhost:9/unreachable",
  authUrl: process.env.AUTH_URL ?? "http://localhost:3300",
});

export { handler as GET };
