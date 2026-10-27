import type { FormEvent } from 'react';
import { useState } from 'react';
import { useEnterGuestKey } from './useEnterGuestKey';

export interface GuestKeyGateProps {
  slug: string;
  onSuccess: () => void;
}

export function GuestKeyGate({ slug, onSuccess }: GuestKeyGateProps) {
  const [key, setKey] = useState('');
  const { mutate, error, isPending } = useEnterGuestKey(slug);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutate({ key: key.trim() }, { onSuccess });
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 text-center">
      <div className="door" aria-hidden="true" />
      <div className="space-y-2">
        <h1 className="font-display text-[2.05rem] leading-tight">Knock, knock.</h1>
        <p>This is a <strong>gift list</strong> on Gubbins, a small wishlist app with no accounts, no ads and no tracking.</p>
        <p className="text-muted">Enter the guest key from your invite to see what they’re hoping for.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4 text-left">
        <div>
          <label htmlFor="guest-key" className="mb-1 block font-bold">Guest key</label>
          <input
            id="guest-key"
            required
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="field"
            placeholder="maple-lantern-otter"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby="guest-key-hint"
          />
          <p id="guest-key-hint" className="mt-1.5 text-sm text-muted">The list owner sent it with your invite: three words joined by dashes.</p>
        </div>
        {/* Deliberately generic regardless of the underlying reason — ADR-016/054: no distinguishing "wrong key" from "no such list." */}
        <p role="alert" className="text-error empty:mb-0">{error ? 'This list could not be found.' : ''}</p>
        <button type="submit" disabled={isPending} className="btn-primary w-full">
          {isPending ? 'Checking…' : 'View list'}
        </button>
      </form>
    </div>
  );
}
