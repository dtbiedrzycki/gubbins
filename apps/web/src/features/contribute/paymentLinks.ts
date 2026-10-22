// The only payment hrefs the app renders. The handle was validated when the list was created.
// Venmo's documented payment link: the app opens it where installed, and a browser shows the payment form otherwise.
export const venmoPayLink = (handle: string, amountMinor: number, note: string): string =>
  `https://venmo.com/${encodeURIComponent(handle)}?txn=pay&amount=${(amountMinor / 100).toFixed(2)}&note=${encodeURIComponent(note)}`;
