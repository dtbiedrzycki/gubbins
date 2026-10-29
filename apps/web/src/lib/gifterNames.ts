const KEY = 'gubbins.gifterNames';

/** The names this guest last gave in a hold or chip-in dialog on this device; blocked or empty storage reads as ''. */
export function readGifterNames(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

/** Remembers the trimmed names; blank names keep the last ones, and where storage is blocked nothing is remembered. */
export function writeGifterNames(names: string): void {
  const trimmed = names.trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(KEY, trimmed);
  } catch {
    // Not remembered: the guest types them again next time.
  }
}
