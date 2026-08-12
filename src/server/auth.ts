import NextAuth from "next-auth";
import {
  DEFAULT_OIDC_TIMEOUT_MS,
  DEFAULT_REFRESH_SKEW_SECONDS,
  DEFAULT_SESSION_MAX_AGE_SECONDS,
  DEFAULT_SESSION_UPDATE_AGE_SECONDS,
  REFRESH_TOKEN_ERROR,
  applyTokenState,
  ensureFreshTokens,
  isAuthorized,
  resolvePositiveNumber,
  toTokenState,
} from "./oidc-tokens";

export interface AppLayerAuthConfig {
  readonly issuer: string | undefined;
  readonly clientId: string | undefined;
  readonly clientSecret: string | undefined;
  /**
   * Session lifetime in seconds. Env: `AUTH_SESSION_MAX_AGE_SECONDS`.
   * Default: 8 hours.
   */
  readonly sessionMaxAgeSeconds?: number;
  /**
   * How often the rolling session cookie is re-issued, in seconds.
   * Env: `AUTH_SESSION_UPDATE_AGE_SECONDS`. Default: 15 minutes.
   */
  readonly sessionUpdateAgeSeconds?: number;
  /**
   * Refresh the access token this many seconds before it expires, clamped to half
   * the observed token lifetime. Env: `AUTH_TOKEN_REFRESH_SKEW_SECONDS`.
   * Default: 5 minutes.
   */
  readonly refreshSkewSeconds?: number;
  /**
   * Timeout for OIDC discovery and token-endpoint calls, in milliseconds.
   * Env: `OIDC_HTTP_TIMEOUT_MS`. Default: 10000.
   */
  readonly oidcTimeoutMs?: number;
}

/**
 * Create the OE-standard NextAuth configuration with OIDC provider,
 * JWT strategy, refresh-token flow, and session-claim mapping.
 *
 * Returns the four NextAuth pieces plus the resolved `oidcIssuer` (some
 * callers like the logout handler need it).
 */
export function createAppLayerAuth(
  config: AppLayerAuthConfig,
): ReturnType<typeof NextAuth> & { oidcIssuer: string | undefined } {
  const { issuer: oidcIssuer, clientId, clientSecret } = config;

  const sessionMaxAge = resolvePositiveNumber(
    config.sessionMaxAgeSeconds,
    "AUTH_SESSION_MAX_AGE_SECONDS",
    DEFAULT_SESSION_MAX_AGE_SECONDS,
  );
  const sessionUpdateAge = resolvePositiveNumber(
    config.sessionUpdateAgeSeconds,
    "AUTH_SESSION_UPDATE_AGE_SECONDS",
    DEFAULT_SESSION_UPDATE_AGE_SECONDS,
  );
  const refreshSkewSeconds = resolvePositiveNumber(
    config.refreshSkewSeconds,
    "AUTH_TOKEN_REFRESH_SKEW_SECONDS",
    DEFAULT_REFRESH_SKEW_SECONDS,
  );
  const oidcTimeoutMs = resolvePositiveNumber(
    config.oidcTimeoutMs,
    "OIDC_HTTP_TIMEOUT_MS",
    DEFAULT_OIDC_TIMEOUT_MS,
  );

  const nextAuth = NextAuth({
    providers: [
      {
        id: "oidc",
        name: "OIDC",
        type: "oidc",
        issuer: oidcIssuer,
        clientId,
        clientSecret,
        authorization: { params: { scope: "openid profile email offline_access roles" } },
      },
    ],
    pages: { signIn: "/login" },
    session: { strategy: "jwt", maxAge: sessionMaxAge, updateAge: sessionUpdateAge },
    jwt: { maxAge: sessionMaxAge },
    callbacks: {
      authorized({ auth: session }) {
        return isAuthorized(session);
      },
      async signIn() {
        return true;
      },
      async jwt({ token, account, profile }) {
        const t = token as Record<string, unknown>;

        if (account) {
          t.accessToken = account.access_token;
          t.refreshToken = account.refresh_token;
          t.idToken = account.id_token;
          t.expiresAt = account.expires_at;
          t.tokenLifetime =
            typeof account.expires_at === "number"
              ? Math.max(0, account.expires_at - Math.floor(Date.now() / 1000))
              : undefined;
          t.error = undefined;
          if (profile) {
            t.name = profile.name;
            t.email = profile.email;
            t.picture = profile.picture;
            const profileRoles = (profile as Record<string, unknown>).roles;
            t.roles = Array.isArray(profileRoles) ? profileRoles : [];
          }
          return token;
        }

        const refreshed = await ensureFreshTokens(toTokenState(t), {
          issuer: oidcIssuer,
          clientId,
          clientSecret,
          refreshSkewSeconds,
          timeoutMs: oidcTimeoutMs,
        });
        applyTokenState(t, refreshed);

        return token;
      },
      async session({ session, token }) {
        const t = token as Record<string, unknown>;
        session.accessToken = t.accessToken as string | undefined;
        session.idToken = t.idToken as string | undefined;
        session.expiresAt = t.expiresAt as number | undefined;
        session.roles = Array.isArray(t.roles) ? (t.roles as string[]) : [];
        session.error = typeof t.error === "string" ? t.error : undefined;
        if (t.error === REFRESH_TOKEN_ERROR) {
          session.accessToken = undefined;
        }
        if (typeof t.name === "string") session.user.name = t.name;
        if (typeof t.email === "string") session.user.email = t.email;
        if (typeof t.picture === "string") session.user.image = t.picture;
        return session;
      },
    },
  });

  return { ...nextAuth, oidcIssuer };
}
