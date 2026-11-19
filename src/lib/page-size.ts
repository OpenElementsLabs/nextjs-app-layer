export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 20;

/**
 * Reads the page size a table persisted under `storageKey`, falling back to the default.
 *
 * Storage can be missing (server rendering, `dom.storage.enabled = false`) or throw on access
 * (site data blocked in hardened browsers such as LibreWolf). The page size is only a
 * convenience, so any failure means "nothing stored".
 */
export function readStoredPageSize(storageKey: string): number {
  let stored: string | null = null;
  try {
    stored = typeof window === "undefined" ? null : window.localStorage.getItem(storageKey);
  } catch {
    // Storage unavailable: use the default.
  }
  const parsed = Number(stored);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed) ? parsed : DEFAULT_PAGE_SIZE;
}
