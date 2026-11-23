import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { appLayerTranslations } from "../../../translations/provider.js";
import { renderWithLibProviders } from "../../../test/render-with-providers.js";

/**
 * `useSearchParams` and `useRouter` need a Next.js router context that does not
 * exist under jsdom, and `signIn` would start a real navigation. Those are the
 * only three substitutions, and `next-auth/react` is otherwise left intact so
 * `SessionProvider` and `useSession` stay real.
 */
const mocks = vi.hoisted(() => ({ search: "", signIn: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock("next-auth/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-auth/react")>()),
  signIn: mocks.signIn,
}));

const { LoginClient, errorMessageFor } = await import("../login-client.js");

const EN = appLayerTranslations.en.login;
const DE = appLayerTranslations.de.login;

afterEach(() => {
  cleanup();
  mocks.search = "";
  mocks.signIn.mockClear();
});

function renderLogin() {
  return renderWithLibProviders(<LoginClient appName="E2E" />, { language: "en", session: null });
}

describe("errorMessageFor", () => {
  it("gives AccessDenied its own message, because retrying cannot help", () => {
    expect(errorMessageFor("AccessDenied", EN)).toBe(EN.errorAccessDenied);
  });

  it("treats a Configuration error as expired or interrupted", () => {
    expect(errorMessageFor("Configuration", EN)).toBe(EN.errorExpired);
  });

  it("treats an unknown error type as retryable rather than falling over", () => {
    // @auth/core collapses everything outside its fixed `clientErrors` set to
    // `Configuration`, and may add types in future versions, so the rule is a
    // classification and not an enumeration.
    expect(errorMessageFor("SomethingElseEntirely", EN)).toBe(EN.errorExpired);
    expect(errorMessageFor("CallbackRouteError", EN)).toBe(EN.errorExpired);
  });

  it("resolves the same way in German", () => {
    expect(errorMessageFor("AccessDenied", DE)).toBe(DE.errorAccessDenied);
    expect(errorMessageFor("Configuration", DE)).toBe(DE.errorExpired);
  });
});

describe("login translations", () => {
  it("carries both new messages in both languages", () => {
    for (const t of [EN, DE]) {
      expect(t.errorExpired.length).toBeGreaterThan(0);
      expect(t.errorAccessDenied.length).toBeGreaterThan(0);
    }
  });

  it("keeps the 0.9.x `error` string, which is part of the exported surface", () => {
    expect(EN.error.length).toBeGreaterThan(0);
    expect(DE.error.length).toBeGreaterThan(0);
  });
});

describe("LoginClient", () => {
  it("shows no error message when the URL carries none", () => {
    renderLogin();

    expect(screen.queryByText(EN.errorExpired)).not.toBeInTheDocument();
    expect(screen.queryByText(EN.errorAccessDenied)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: EN.button })).toBeEnabled();
  });

  it("shows the expired message and an enabled retry for a Configuration error", () => {
    mocks.search = "error=Configuration";
    renderLogin();

    expect(screen.getByText(EN.errorExpired)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: EN.button })).toBeEnabled();
  });

  it("shows the access-denied message for AccessDenied", () => {
    mocks.search = "error=AccessDenied";
    renderLogin();

    expect(screen.getByText(EN.errorAccessDenied)).toBeInTheDocument();
    expect(screen.queryByText(EN.errorExpired)).not.toBeInTheDocument();
  });

  it("disables the button after the first click, so two sign-ins cannot race", () => {
    renderLogin();

    const button = screen.getByRole("button", { name: EN.button });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(mocks.signIn).toHaveBeenCalledWith("oidc");
  });

  it("ignores further clicks once disabled", () => {
    renderLogin();

    const button = screen.getByRole("button", { name: EN.button });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(mocks.signIn).toHaveBeenCalledTimes(1);
  });
});
