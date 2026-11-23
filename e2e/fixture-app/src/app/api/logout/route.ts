import { createLogoutHandler } from "@open-elements/nextjs-app-layer/server";
import { auth, oidcIssuer } from "@/auth";

const handler = createLogoutHandler({
  auth,
  oidcIssuer,
  authUrl: process.env.AUTH_URL ?? "http://localhost:3300",
});

export { handler as GET };
