const KEY = 'gubbins.gifterNames';

/** The names this guest last sent with a hold or pledge on this device; blocked or empty storage reads as ''. */
export function readGifterNames(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

/** Remembers the names; where storage is blocked they are simply not remembered. */
export function writeGifterNames(names: string): void {
  try {
    localStorage.setItem(KEY, names);
  } catch {
    // Not remembered: the guest types them again next time.
  }
}
