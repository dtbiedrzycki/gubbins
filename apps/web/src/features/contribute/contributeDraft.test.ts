import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, loadDraft, saveDraft, type ContributeDraft } from './contributeDraft';

const DAY_MS = 24 * 60 * 60 * 1000;
const draft: ContributeDraft = { itemId: 'item-1', amountText: '25.00', message: 'Enjoy!', idempotencyKey: 'key-1', savedAt: 1_000 };

describe('contributeDraft', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gives back the draft saved for the list, until it is cleared', () => {
    saveDraft('abc123', draft);

    expect(loadDraft('abc123', draft.savedAt)).toEqual(draft);
    clearDraft('abc123');
    expect(loadDraft('abc123', draft.savedAt)).toBeNull();
  });

  it("gives a list's draft to that list only", () => {
    saveDraft('abc123', draft);

    expect(loadDraft('other', draft.savedAt)).toBeNull();
  });

  it('keeps a draft for 24 hours and forgets it 1 ms later', () => {
    saveDraft('abc123', draft);

    expect(loadDraft('abc123', draft.savedAt + DAY_MS)).toEqual(draft);
    expect(loadDraft('abc123', draft.savedAt + DAY_MS + 1)).toBeNull();
    expect(localStorage.getItem('gubbins:contribute-draft:abc123')).toBeNull();
  });

  it('reads nothing, and throws nothing, when the browser blocks storage', () => {
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) {
      vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw new Error('blocked'); });
    }

    expect(() => saveDraft('abc123', draft)).not.toThrow();
    expect(() => clearDraft('abc123')).not.toThrow();
    expect(loadDraft('abc123', draft.savedAt)).toBeNull();
  });
});
