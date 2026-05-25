import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { AuditLogsClient } from "../audit-logs-client";
import { renderWithLibProviders } from "../../../../test/render-with-providers";
import { appLayerTranslations } from "../../../../translations/provider";
import type { AppLayerApiClient } from "../../../../api/client";
import type { AuditLogDto, Page, UserDto } from "../../../../api/types";

function emptyPage<T>(): Page<T> {
  return {
    content: [],
    page: { size: 20, number: 0, totalElements: 0, totalPages: 0 },
  };
}

const systemUser: UserDto = {
  id: "u-1",
  name: "Alice",
  email: "alice@example.com",
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function pageOf(entries: AuditLogDto[]): Page<AuditLogDto> {
  return {
    content: entries,
    page: { size: 20, number: 0, totalElements: entries.length, totalPages: 1 },
  };
}

function makeClient(overrides: Partial<AppLayerApiClient> = {}): AppLayerApiClient {
  const stub = {
    getAuditLogs: vi.fn().mockResolvedValue(emptyPage<AuditLogDto>()),
    getAuditLogEntityTypes: vi.fn().mockResolvedValue([]),
    getUsers: vi.fn().mockResolvedValue(emptyPage<UserDto>()),
    getApiKeys: vi.fn(),
    createApiKey: vi.fn(),
    deleteApiKey: vi.fn(),
    getWebhooks: vi.fn(),
    createWebhook: vi.fn(),
    updateWebhook: vi.fn(),
    deleteWebhook: vi.fn(),
    pingWebhook: vi.fn(),
    getTranslationSettings: vi.fn(),
    getCurrentUser: vi.fn(),
    ...overrides,
  } as unknown as AppLayerApiClient;
  return stub;
}

afterEach(() => cleanup());

describe("AuditLogsClient", () => {
  it("shows the skeleton while loading", () => {
    const client = makeClient({
      getAuditLogs: vi.fn(() => new Promise<Page<AuditLogDto>>(() => {})),
    });
    renderWithLibProviders(<AuditLogsClient />, { apiClient: client });
    expect(screen.getByTestId("audit-logs-loading")).toBeInTheDocument();
  });

  it("shows the empty state when the API returns no entries", async () => {
    const client = makeClient();
    renderWithLibProviders(<AuditLogsClient />, { apiClient: client, language: "en" });
    await waitFor(() => {
      expect(screen.getByTestId("audit-logs-empty")).toBeInTheDocument();
    });
    expect(screen.getByText(appLayerTranslations.en.auditLog.empty)).toBeInTheDocument();
  });

  it("shows the error state when the fetch rejects", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = makeClient({
      getAuditLogs: vi.fn().mockRejectedValue(new Error("boom")),
    });
    renderWithLibProviders(<AuditLogsClient />, { apiClient: client, language: "en" });
    await waitFor(() => {
      expect(screen.getByTestId("audit-logs-error")).toBeInTheDocument();
    });
    expect(screen.getByText(appLayerTranslations.en.auditLog.loadError)).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it("shows the human-readable name of the audited entity", async () => {
    const entry: AuditLogDto = {
      id: "a-1",
      entityType: "ApiKey",
      entityId: "11111111-1111-1111-1111-111111111111",
      name: "CI deployment key",
      action: "INSERT",
      user: systemUser,
      createdAt: "2026-01-01T00:00:00Z",
    };
    const client = makeClient({ getAuditLogs: vi.fn().mockResolvedValue(pageOf([entry])) });
    renderWithLibProviders(<AuditLogsClient />, { apiClient: client, language: "en" });
    await waitFor(() => {
      expect(screen.getByText("CI deployment key")).toBeInTheDocument();
    });
    expect(screen.getByText(appLayerTranslations.en.auditLog.columns.name)).toBeInTheDocument();
  });

  it("falls back to a dash when the entity has no name", async () => {
    const entry: AuditLogDto = {
      id: "a-2",
      entityType: "ApiKey",
      entityId: "22222222-2222-2222-2222-222222222222",
      name: "",
      action: "DELETE",
      user: systemUser,
      createdAt: "2026-01-01T00:00:00Z",
    };
    const client = makeClient({ getAuditLogs: vi.fn().mockResolvedValue(pageOf([entry])) });
    renderWithLibProviders(<AuditLogsClient />, { apiClient: client, language: "en" });
    await waitFor(() => {
      expect(screen.getByText("—")).toBeInTheDocument();
    });
  });
});
