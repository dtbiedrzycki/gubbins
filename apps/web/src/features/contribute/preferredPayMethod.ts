export type PayMethod = 'venmo' | 'zelle';

const KEY = 'gubbins.payMethod';

/** The method this guest last chose on this device; blocked or empty storage reads as null. */
export function readPreferredPayMethod(): PayMethod | null {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === 'venmo' || stored === 'zelle' ? stored : null;
  } catch {
    return null;
  }
}

/** Remembers the choice; where storage is blocked it is simply not remembered. */
export function writePreferredPayMethod(method: PayMethod): void {
  try {
    localStorage.setItem(KEY, method);
  } catch {
    // Not remembered: the switch still works for this visit.
  }
}
