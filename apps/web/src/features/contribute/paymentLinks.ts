// The only payment hrefs the app renders. The handle was validated when the list was created.
export const venmoAppLink = (handle: string, amountMinor: number, note: string): string =>
  `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(handle)}&amount=${(amountMinor / 100).toFixed(2)}&note=${encodeURIComponent(note)}`;

export const venmoWebLink = (handle: string): string => `https://account.venmo.com/u/${encodeURIComponent(handle)}`;
