import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { ServerStatusClient, type StatusCapabilitiesConfig } from "../server-status-client";
import { renderWithLibProviders } from "../../../../test/render-with-providers";

const HEIC_CONFIG: StatusCapabilitiesConfig = {
  endpoint: "/api/admin/capabilities",
  items: [
    {
      id: "heicAvailable",
      label: "HEIC image decoding",
      availableText: "Available",
      unavailableText: "Not available",
      hint: "HEIC uploads will be rejected with 415 — check Dockerfile",
    },
  ],
};

function jsonResponse(body: unknown): Response {
  return { ok: true, json: () => Promise.resolve(body) } as unknown as Response;
}

/** Route fetch responses by URL; an unmapped URL rejects (surfacing test gaps). */
function stubFetch(handlers: Record<string, () => Promise<Response>>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const handler = handlers[url];
      if (!handler) {
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }
      return handler();
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ServerStatusClient", () => {
  it("renders only the backend health row when no capabilities config is given", async () => {
    stubFetch({
      "/api/health": () => Promise.resolve(jsonResponse({ status: "UP" })),
    });

    renderWithLibProviders(<ServerStatusClient />);

    await waitFor(() => expect(screen.getByText("System Status")).toBeInTheDocument());
    expect(screen.queryByText("HEIC image decoding")).not.toBeInTheDocument();
  });

  it("renders a green capability row from the fetched capabilities map", async () => {
    stubFetch({
      "/api/health": () => Promise.resolve(jsonResponse({ status: "UP" })),
      "/api/admin/capabilities": () => Promise.resolve(jsonResponse({ heicAvailable: true })),
    });

    renderWithLibProviders(<ServerStatusClient capabilities={HEIC_CONFIG} />);

    await waitFor(() => expect(screen.getByText("HEIC image decoding")).toBeInTheDocument());
    expect(screen.getByText("Available")).toBeInTheDocument();
    // Backend health row is still present.
    expect(screen.getByText("System Status")).toBeInTheDocument();
  });

  it("renders the capability as available=false when the endpoint reports it unavailable", async () => {
    stubFetch({
      "/api/health": () => Promise.resolve(jsonResponse({ status: "UP" })),
      "/api/admin/capabilities": () => Promise.resolve(jsonResponse({ heicAvailable: false })),
    });

    renderWithLibProviders(<ServerStatusClient capabilities={HEIC_CONFIG} />);

    await waitFor(() => expect(screen.getByText("Not available")).toBeInTheDocument());
  });

  it("fails safe to unavailable when the capabilities fetch rejects", async () => {
    stubFetch({
      "/api/health": () => Promise.resolve(jsonResponse({ status: "UP" })),
      "/api/admin/capabilities": () => Promise.reject(new Error("network down")),
    });

    renderWithLibProviders(<ServerStatusClient capabilities={HEIC_CONFIG} />);

    await waitFor(() => expect(screen.getByText("Not available")).toBeInTheDocument());
    expect(screen.queryByText("Available")).not.toBeInTheDocument();
  });

  it("fails safe to unavailable when the capabilities endpoint returns a non-ok response", async () => {
    stubFetch({
      "/api/health": () => Promise.resolve(jsonResponse({ status: "UP" })),
      "/api/admin/capabilities": () =>
        Promise.resolve({ ok: false, json: () => Promise.resolve(null) } as unknown as Response),
    });

    renderWithLibProviders(<ServerStatusClient capabilities={HEIC_CONFIG} />);

    await waitFor(() => expect(screen.getByText("Not available")).toBeInTheDocument());
  });
});
