import "@open-elements/nextjs-app-layer/server/next-auth-types";
import { createAppLayerAuth } from "@open-elements/nextjs-app-layer/server";

/**
 * Wired exactly as a consuming app does (see `open-crm`), with defaults that fit
 * the local compose stack so `pnpm e2e` needs no environment file.
 *
 * The issuer must be the same URL for the browser and this server: the mock IdP
 * derives the `issuer` claim from the request's Host header, so reaching it over
 * the compose network would yield a different issuer and fail validation.
 */
export const { handlers, auth, signIn, signOut, oidcIssuer } = createAppLayerAuth({
  issuer: process.env.OIDC_ISSUER ?? "http://localhost:8300/default",
  clientId: process.env.OIDC_CLIENT_ID ?? "e2e-client",
  clientSecret: process.env.OIDC_CLIENT_SECRET ?? "e2e-secret",
});
