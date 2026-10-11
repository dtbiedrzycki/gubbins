import { useState } from 'react';

export interface HoldCredential {
  idempotencyKey: string;
}

/**
 * The credential a hold submit carries, minted once when the hold dialog
 * opens (a lazy state initializer) — never per tap, which would give every
 * retry a fresh key and defeat ADR-0048 (guest UX: "generated when the
 * sheet is opened"). The dialog mounts on open and unmounts on close, so
 * each opening has its own key and every re-render or retry within one
 * opening reuses it. Stack E adds the Ed25519 seed and public key here.
 */
export function useHoldCredential(): HoldCredential {
  const [credential] = useState<HoldCredential>(() => ({ idempotencyKey: crypto.randomUUID() }));
  return credential;
}
