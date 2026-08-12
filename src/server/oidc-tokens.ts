// OIDC token handling for `createAppLayerAuth()`.
// Split out of `auth.ts` so the refresh logic can be unit-tested without a live IdP.

export const REFRESH_TOKEN_ERROR = "RefreshTokenError";

export const DEFAULT_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
export const DEFAULT_SESSION_UPDATE_AGE_SECONDS = 15 * 60;
export const DEFAULT_REFRESH_SKEW_SECONDS = 5 * 60;
export const DEFAULT_OIDC_TIMEOUT_MS = 10_000;

/** Never refresh closer than this to expiry, even for very short-lived tokens. */
const MIN_REFRESH_SKEW_SECONDS = 5;

const DISCOVERY_CACHE_TTL_MS = 10 * 60 * 1000;

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

// The package does not depend on @types/node, so `process` is reached via globalThis.
function readEnv(name: string): string | undefined {
  const globals = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return globals.process?.env?.[name];
}

/**
 * Resolve a numeric option: explicit config value > env var > default.
 * Non-numeric or non-positive values fall back to the default.
 */
export function resolvePositiveNumber(
  explicit: number | undefined,
  envName: string,
  fallback: number,
): number {
  if (isPositiveFinite(explicit)) {
    return explicit;
  }
  const raw = readEnv(envName);
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (isPositiveFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

/**
 * Clamp the configured refresh skew to half the observed token lifetime, so an IdP
 * that issues very short-lived access tokens is refreshed once per half-lifetime
 * instead of on every single request.
 */
export function effectiveRefreshSkewSeconds(
  configuredSkewSeconds: number,
  tokenLifetimeSeconds: number | undefined,
): number {
  if (!isPositiveFinite(tokenLifetimeSeconds)) {
    return configuredSkewSeconds;
  }
  return Math.max(
    MIN_REFRESH_SKEW_SECONDS,
    Math.min(configuredSkewSeconds, Math.floor(tokenLifetimeSeconds / 2)),
  );
}

export interface TokenState {
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  /** Access-token expiry as a UNIX timestamp in seconds. */
  expiresAt?: number;
  /** Observed access-token lifetime in seconds, used to clamp the refresh skew. */
  tokenLifetime?: number;
  error?: string;
}

/** True when the access token is missing an expiry or is inside the refresh window. */
export function needsRefresh(
  state: Pick<TokenState, "expiresAt" | "tokenLifetime">,
  configuredSkewSeconds: number,
  nowMs: number = Date.now(),
): boolean {
  if (typeof state.expiresAt !== "number" || !Number.isFinite(state.expiresAt)) {
    return true;
  }
  const skew = effectiveRefreshSkewSeconds(configuredSkewSeconds, state.tokenLifetime);
  return nowMs >= (state.expiresAt - skew) * 1000;
}

/** True when the access token is already past its expiry (or has none). */
export function isAccessTokenExpired(
  expiresAt: number | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) {
    return true;
  }
  return nowMs >= expiresAt * 1000;
}

/** Middleware gate: a session with a dead refresh token is not authorized. */
export function isAuthorized(
  session: { user?: unknown; error?: unknown } | null | undefined,
): boolean {
  if (!session?.user) {
    return false;
  }
  return session.error !== REFRESH_TOKEN_ERROR;
}

export class TokenRefreshError extends Error {
  /** `true` when the refresh token itself was rejected and retrying is pointless. */
  readonly permanent: boolean;

  constructor(message: string, permanent: boolean, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TokenRefreshError";
    this.permanent = permanent;
  }
}

interface DiscoveryCacheEntry {
  readonly tokenEndpoint: string;
  readonly expiresAtMs: number;
}

const discoveryCache = new Map<string, DiscoveryCacheEntry>();
const inFlightRefreshes = new Map<string, Promise<RefreshedTokens>>();

/** Clears the discovery cache and in-flight refreshes. Exported for tests. */
export function resetOidcRuntimeState(): void {
  discoveryCache.clear();
  inFlightRefreshes.clear();
}

async function resolveTokenEndpoint(
  issuer: string,
  timeoutMs: number,
  nowMs: number,
): Promise<string> {
  const cached = discoveryCache.get(issuer);
  if (cached && cached.expiresAtMs > nowMs) {
    return cached.tokenEndpoint;
  }

  let response: Response;
  try {
    response = await fetch(`${issuer}/.well-known/openid-configuration`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw new TokenRefreshError("OIDC discovery request failed", false, { cause });
  }
  if (!response.ok) {
    throw new TokenRefreshError(`OIDC discovery failed with status ${response.status}`, false);
  }

  let tokenEndpoint: unknown;
  try {
    tokenEndpoint = ((await response.json()) as Record<string, unknown>).token_endpoint;
  } catch (cause) {
    throw new TokenRefreshError("OIDC discovery returned an unreadable body", false, { cause });
  }
  if (typeof tokenEndpoint !== "string" || tokenEndpoint === "") {
    throw new TokenRefreshError("OIDC discovery returned no token_endpoint", false);
  }

  discoveryCache.set(issuer, { tokenEndpoint, expiresAtMs: nowMs + DISCOVERY_CACHE_TTL_MS });
  return tokenEndpoint;
}

export interface RefreshedTokens {
  readonly accessToken: string;
  readonly refreshToken?: string;
  readonly expiresInSeconds?: number;
}

export interface RefreshRequest {
  readonly issuer: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
  readonly timeoutMs: number;
}

async function performRefresh(request: RefreshRequest, nowMs: number): Promise<RefreshedTokens> {
  const tokenEndpoint = await resolveTokenEndpoint(request.issuer, request.timeoutMs, nowMs);

  let response: Response;
  try {
    response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: request.clientId,
        client_secret: request.clientSecret,
        refresh_token: request.refreshToken,
      }),
      signal: AbortSignal.timeout(request.timeoutMs),
    });
  } catch (cause) {
    throw new TokenRefreshError("Token refresh request failed", false, { cause });
  }

  if (!response.ok) {
    const permanent = response.status >= 400 && response.status < 500;
    if (permanent) {
      // A 4xx may also mean the cached token endpoint is stale.
      discoveryCache.delete(request.issuer);
    }
    throw new TokenRefreshError(`Token refresh failed with status ${response.status}`, permanent);
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch (cause) {
    throw new TokenRefreshError("Token response was unreadable", false, { cause });
  }

  const accessToken = payload.access_token;
  if (typeof accessToken !== "string" || accessToken === "") {
    throw new TokenRefreshError("Token response contained no access_token", false);
  }

  return {
    accessToken,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : undefined,
    expiresInSeconds: isPositiveFinite(payload.expires_in) ? payload.expires_in : undefined,
  };
}

/**
 * Refresh the access token, de-duplicated per refresh token: concurrent callers
 * share a single POST so IdPs with refresh-token rotation do not invalidate the
 * losers of the race.
 */
export function refreshAccessToken(
  request: RefreshRequest,
  nowMs: number = Date.now(),
): Promise<RefreshedTokens> {
  const inFlight = inFlightRefreshes.get(request.refreshToken);
  if (inFlight) {
    return inFlight;
  }
  const pending = performRefresh(request, nowMs).finally(() => {
    inFlightRefreshes.delete(request.refreshToken);
  });
  inFlightRefreshes.set(request.refreshToken, pending);
  return pending;
}

export interface RefreshOptions {
  readonly issuer: string | undefined;
  readonly clientId: string | undefined;
  readonly clientSecret: string | undefined;
  readonly refreshSkewSeconds: number;
  readonly timeoutMs: number;
}

/**
 * Return the token state to persist on the JWT: unchanged while the access token is
 * still comfortably valid, refreshed when it is inside the refresh window.
 *
 * A transient failure (5xx, network error, timeout) keeps the existing token and only
 * fails the session once that token has actually expired; a 4xx from the token
 * endpoint means the refresh token is dead and fails the session immediately.
 */
export async function ensureFreshTokens(
  state: TokenState,
  options: RefreshOptions,
  nowMs: number = Date.now(),
): Promise<TokenState> {
  if (!needsRefresh(state, options.refreshSkewSeconds, nowMs)) {
    return state;
  }

  const expired = isAccessTokenExpired(state.expiresAt, nowMs);
  const { issuer, clientId, clientSecret } = options;

  if (!state.refreshToken || !issuer || !clientId || !clientSecret) {
    // No way to refresh (e.g. the IdP did not grant `offline_access`).
    return expired ? { ...state, error: REFRESH_TOKEN_ERROR } : state;
  }

  try {
    const refreshed = await refreshAccessToken(
      {
        issuer,
        clientId,
        clientSecret,
        refreshToken: state.refreshToken,
        timeoutMs: options.timeoutMs,
      },
      nowMs,
    );

    const lifetime = refreshed.expiresInSeconds ?? state.tokenLifetime;
    return {
      ...state,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? state.refreshToken,
      expiresAt: lifetime === undefined ? undefined : Math.floor(nowMs / 1000) + lifetime,
      tokenLifetime: lifetime,
      error: undefined,
    };
  } catch (error) {
    const permanent = error instanceof TokenRefreshError && error.permanent;
    // Never log token material — only the classification and the error message.
    console.error(
      `Token refresh failed (${permanent ? "permanent" : "transient"}):`,
      error instanceof Error ? error.message : String(error),
    );
    return permanent || expired ? { ...state, error: REFRESH_TOKEN_ERROR } : state;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Read the token state out of the untyped NextAuth JWT record. */
export function toTokenState(token: Record<string, unknown>): TokenState {
  return {
    accessToken: asString(token.accessToken),
    refreshToken: asString(token.refreshToken),
    idToken: asString(token.idToken),
    expiresAt: asNumber(token.expiresAt),
    tokenLifetime: asNumber(token.tokenLifetime),
    error: asString(token.error),
  };
}

/** Write the token state back onto the untyped NextAuth JWT record. */
export function applyTokenState(token: Record<string, unknown>, state: TokenState): void {
  token.accessToken = state.accessToken;
  token.refreshToken = state.refreshToken;
  token.idToken = state.idToken;
  token.expiresAt = state.expiresAt;
  token.tokenLifetime = state.tokenLifetime;
  token.error = state.error;
}
