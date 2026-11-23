import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PAGE_SIZE, readStoredPageSize } from "../page-size.js";

const KEY = "pageSize.test";

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.removeItem(KEY);
});

describe("readStoredPageSize", () => {
  it("returns a stored size that is one of the options", () => {
    window.localStorage.setItem(KEY, "50");
    expect(readStoredPageSize(KEY)).toBe(50);
  });

  it("falls back to the default when nothing is stored", () => {
    expect(readStoredPageSize(KEY)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("falls back to the default for a size that is not an option", () => {
    window.localStorage.setItem(KEY, "33");
    expect(readStoredPageSize(KEY)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("falls back to the default when reading storage throws", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    expect(readStoredPageSize(KEY)).toBe(DEFAULT_PAGE_SIZE);
  });

  it("falls back to the default when accessing localStorage throws", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    expect(readStoredPageSize(KEY)).toBe(DEFAULT_PAGE_SIZE);
  });
});
