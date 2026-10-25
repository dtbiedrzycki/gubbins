// The only payment hrefs the app renders. The handle was validated when the list was created.
// Venmo's https payment link: the app opens it where installed, and Venmo's website shows the payment filled in
// otherwise. Checked by hand, not from Venmo's docs; the go-live checklist in docs/deploy.md re-checks it.
export const venmoPayLink = (handle: string, amountMinor: number, note: string): string =>
  `https://venmo.com/${encodeURIComponent(handle)}?txn=pay&amount=${(amountMinor / 100).toFixed(2)}&note=${encodeURIComponent(note)}`;
