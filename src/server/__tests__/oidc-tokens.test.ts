import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DEFAULT_REFRESH_SKEW_SECONDS,
  REFRESH_TOKEN_ERROR,
  effectiveRefreshSkewSeconds,
  ensureFreshTokens,
  isAuthorized,
  needsRefresh,
  refreshAccessToken,
  resetOidcRuntimeState,
  resolvePositiveNumber,
} from "../oidc-tokens";

const ISSUER = "https://idp.example.test";
const TOKEN_ENDPOINT = `${ISSUER}/application/o/token/`;

const OPTIONS = {
  issuer: ISSUER,
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshSkewSeconds: DEFAULT_REFRESH_SKEW_SECONDS,
  timeoutMs: 10_000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function discoveryResponse(): Response {
  return jsonResponse({ token_endpoint: TOKEN_ENDPOINT });
}

/** A fetch mock that answers discovery from the well-known URL and delegates the rest. */
function mockFetch(tokenResponse: () => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/.well-known/openid-configuration")) {
      return discoveryResponse();
    }
    return tokenResponse();
  });
}

const NOW_MS = 1_700_000_000_000;
const NOW_SEC = Math.floor(NOW_MS / 1000);

describe("resolvePositiveNumber", () => {
  const ENV = "APP_LAYER_TEST_NUMBER";
  const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } })
    .process.env;

  afterEach(() => {
    delete env[ENV];
  });

  it("prefers the explicit config value over env and default", () => {
    env[ENV] = "20";
    expect(resolvePositiveNumber(10, ENV, 30)).toBe(10);
  });

  it("falls back to the env var when no config value is given", () => {
    env[ENV] = "20";
    expect(resolvePositiveNumber(undefined, ENV, 30)).toBe(20);
  });

  it("falls back to the default for non-numeric or non-positive values", () => {
    env[ENV] = "not-a-number";
    expect(resolvePositiveNumber(undefined, ENV, 30)).toBe(30);
    env[ENV] = "0";
    expect(resolvePositiveNumber(undefined, ENV, 30)).toBe(30);
    env[ENV] = "-5";
    expect(resolvePositiveNumber(undefined, ENV, 30)).toBe(30);
    expect(resolvePositiveNumber(-1, ENV, 30)).toBe(30);
  });

  it("falls back to the default when neither config nor env is set", () => {
    expect(resolvePositiveNumber(undefined, ENV, 30)).toBe(30);
  });
});

describe("effectiveRefreshSkewSeconds", () => {
  it("clamps the skew to half the token lifetime", () => {
    expect(effectiveRefreshSkewSeconds(300, 60)).toBe(30);
  });

  it("never goes below the 5 second floor", () => {
    expect(effectiveRefreshSkewSeconds(300, 4)).toBe(5);
  });

  it("keeps the configured skew for long-lived tokens", () => {
    expect(effectiveRefreshSkewSeconds(300, 3600)).toBe(300);
  });

  it("keeps the configured skew when the lifetime is unknown", () => {
    expect(effectiveRefreshSkewSeconds(300, undefined)).toBe(300);
  });
});

describe("needsRefresh", () => {
  it("returns false immediately after a 60 second token was issued", () => {
    const state = { expiresAt: NOW_SEC + 60, tokenLifetime: 60 };
    expect(needsRefresh(state, DEFAULT_REFRESH_SKEW_SECONDS, NOW_MS)).toBe(false);
  });

  it("returns true once past half the lifetime of a 60 second token", () => {
    const state = { expiresAt: NOW_SEC + 60, tokenLifetime: 60 };
    expect(needsRefresh(state, DEFAULT_REFRESH_SKEW_SECONDS, NOW_MS + 31_000)).toBe(true);
  });

  it("returns true when expiresAt is missing", () => {
    expect(needsRefresh({}, DEFAULT_REFRESH_SKEW_SECONDS, NOW_MS)).toBe(true);
  });

  it("uses the configured skew for long-lived tokens", () => {
    const state = { expiresAt: NOW_SEC + 3600, tokenLifetime: 3600 };
    expect(needsRefresh(state, DEFAULT_REFRESH_SKEW_SECONDS, NOW_MS)).toBe(false);
    expect(needsRefresh(state, DEFAULT_REFRESH_SKEW_SECONDS, NOW_MS + 3_301_000)).toBe(true);
  });
});

describe("isAuthorized", () => {
  it("returns false when the session has a refresh token error", () => {
    expect(isAuthorized({ user: { name: "Ada" }, error: REFRESH_TOKEN_ERROR })).toBe(false);
  });

  it("returns true for a healthy session", () => {
    expect(isAuthorized({ user: { name: "Ada" } })).toBe(true);
  });

  it("returns false without a user", () => {
    expect(isAuthorized(null)).toBe(false);
    expect(isAuthorized({})).toBe(false);
  });
});

describe("token refresh", () => {
  beforeEach(() => {
    resetOidcRuntimeState();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("de-duplicates concurrent refreshes of the same refresh token", async () => {
    let resolveToken: (value: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => {
      resolveToken = resolve;
    });
    const fetchMock = mockFetch(() => pending);
    vi.stubGlobal("fetch", fetchMock);

    const request = {
      issuer: ISSUER,
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-1",
      timeoutMs: 10_000,
    };
    const first = refreshAccessToken(request, NOW_MS);
    const second = refreshAccessToken(request, NOW_MS);

    resolveToken(jsonResponse({ access_token: "new-access", expires_in: 60 }));
    const [a, b] = await Promise.all([first, second]);

    expect(a.accessToken).toBe("new-access");
    expect(b.accessToken).toBe("new-access");
    const tokenCalls = fetchMock.mock.calls.filter(
      ([url]) => !String(url).includes("/.well-known/"),
    );
    expect(tokenCalls).toHaveLength(1);
  });

  it("fetches OIDC discovery only once across refreshes within the TTL", async () => {
    const fetchMock = mockFetch(() => jsonResponse({ access_token: "new-access", expires_in: 60 }));
    vi.stubGlobal("fetch", fetchMock);

    const state = { accessToken: "old", refreshToken: "refresh-1", expiresAt: NOW_SEC - 1 };
    await ensureFreshTokens(state, OPTIONS, NOW_MS);
    await ensureFreshTokens({ ...state, refreshToken: "refresh-2" }, OPTIONS, NOW_MS + 1000);

    const discoveryCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/.well-known/openid-configuration"),
    );
    expect(discoveryCalls).toHaveLength(1);
  });

  it("sets RefreshTokenError when the token endpoint rejects the refresh token", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(() => jsonResponse({ error: "invalid_grant" }, 400)),
    );

    const result = await ensureFreshTokens(
      { accessToken: "old", refreshToken: "refresh-1", expiresAt: NOW_SEC + 3600 },
      OPTIONS,
      // Inside the refresh window of a long-lived token.
      (NOW_SEC + 3600 - 10) * 1000,
    );

    expect(result.error).toBe(REFRESH_TOKEN_ERROR);
  });

  it("keeps the existing token on a 5xx while the access token is still valid", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(() => jsonResponse({}, 503)),
    );

    const result = await ensureFreshTokens(
      {
        accessToken: "old",
        refreshToken: "refresh-1",
        expiresAt: NOW_SEC + 3600,
        tokenLifetime: 3600,
      },
      OPTIONS,
      (NOW_SEC + 3600 - 10) * 1000,
    );

    expect(result.error).toBeUndefined();
    expect(result.accessToken).toBe("old");
  });

  it("sets RefreshTokenError on a 5xx once the access token has expired", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(() => jsonResponse({}, 503)),
    );

    const result = await ensureFreshTokens(
      { accessToken: "old", refreshToken: "refresh-1", expiresAt: NOW_SEC - 1 },
      OPTIONS,
      NOW_MS,
    );

    expect(result.error).toBe(REFRESH_TOKEN_ERROR);
  });

  it("keeps the existing token on a network error while the access token is valid", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(() => {
        throw new Error("socket hang up");
      }),
    );

    const result = await ensureFreshTokens(
      {
        accessToken: "old",
        refreshToken: "refresh-1",
        expiresAt: NOW_SEC + 3600,
        tokenLifetime: 3600,
      },
      OPTIONS,
      (NOW_SEC + 3600 - 10) * 1000,
    );

    expect(result.error).toBeUndefined();
    expect(result.accessToken).toBe("old");
  });

  it("stores the rotated refresh token and the new lifetime", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(() =>
        jsonResponse({ access_token: "new-access", refresh_token: "refresh-2", expires_in: 60 }),
      ),
    );

    const result = await ensureFreshTokens(
      { accessToken: "old", refreshToken: "refresh-1", expiresAt: NOW_SEC - 1 },
      OPTIONS,
      NOW_MS,
    );

    expect(result.accessToken).toBe("new-access");
    expect(result.refreshToken).toBe("refresh-2");
    expect(result.expiresAt).toBe(NOW_SEC + 60);
    expect(result.tokenLifetime).toBe(60);
    expect(result.error).toBeUndefined();
  });

  it("does not call the IdP while the access token is comfortably valid", async () => {
    const fetchMock = mockFetch(() => jsonResponse({ access_token: "new-access", expires_in: 60 }));
    vi.stubGlobal("fetch", fetchMock);

    const state = {
      accessToken: "old",
      refreshToken: "refresh-1",
      expiresAt: NOW_SEC + 60,
      tokenLifetime: 60,
    };
    const result = await ensureFreshTokens(state, OPTIONS, NOW_MS);

    expect(result).toBe(state);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sets RefreshTokenError without a refresh token only once the token expired", async () => {
    const fetchMock = mockFetch(() => jsonResponse({}, 500));
    vi.stubGlobal("fetch", fetchMock);

    const valid = await ensureFreshTokens(
      { accessToken: "old", expiresAt: NOW_SEC + 3600, tokenLifetime: 3600 },
      OPTIONS,
      (NOW_SEC + 3600 - 10) * 1000,
    );
    expect(valid.error).toBeUndefined();

    const expired = await ensureFreshTokens(
      { accessToken: "old", expiresAt: NOW_SEC - 1 },
      OPTIONS,
      NOW_MS,
    );
    expect(expired.error).toBe(REFRESH_TOKEN_ERROR);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
