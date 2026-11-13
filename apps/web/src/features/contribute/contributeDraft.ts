/** A chip-in the guest left on the pay step, to pick up when they come back from paying. */
export interface ContributeDraft {
  itemId: string;
  amountText: string;
  message: string;
  idempotencyKey: string;
  savedAt: number;
}

// Long enough to pay and come back; short enough that a later visit doesn't reopen a chip-in the guest has forgotten.
const DAY_MS = 24 * 60 * 60 * 1000;
// One per list, in localStorage: re-tapping the invite link opens a new tab, which sessionStorage would not reach.
const keyFor = (slug: string) => `gubbins:contribute-draft:${slug}`;

/** The list's draft, or null when there is none, it is over 24 hours old (and so removed), or storage is blocked. */
export function loadDraft(slug: string, now: number): ContributeDraft | null {
  try {
    const stored = localStorage.getItem(keyFor(slug));
    if (stored === null) return null;
    const draft = JSON.parse(stored) as ContributeDraft;
    if (now - draft.savedAt <= DAY_MS) return draft;
    localStorage.removeItem(keyFor(slug));
    return null;
  } catch {
    return null;
  }
}

/** Replaces the list's draft; where storage is blocked nothing is kept. */
export function saveDraft(slug: string, draft: ContributeDraft): void {
  try {
    localStorage.setItem(keyFor(slug), JSON.stringify(draft));
  } catch {
    // Not kept: a guest whose tab is dropped starts the chip-in again.
  }
}

export function clearDraft(slug: string): void {
  try {
    localStorage.removeItem(keyFor(slug));
  } catch {
    // Blocked storage never held a draft.
  }
}
