// The only payment hrefs the app renders. The handle was validated when the list was created.
export const venmoAppLink = (handle: string, amountMinor: number, note: string): string =>
  `venmo://paycharge?txn=pay&recipients=${encodeURIComponent(handle)}&amount=${(amountMinor / 100).toFixed(2)}&note=${encodeURIComponent(note)}`;

// Venmo's documented payment link: a browser opens the payment form with the amount and note filled in.
export const venmoWebLink = (handle: string, amountMinor: number, note: string): string =>
  `https://venmo.com/${encodeURIComponent(handle)}?txn=pay&amount=${(amountMinor / 100).toFixed(2)}&note=${encodeURIComponent(note)}`;
