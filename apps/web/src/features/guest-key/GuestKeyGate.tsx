import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { ApiError, isNetworkFailure } from '../../api/client';
import { actionErrorMessage, ourEndMessage } from '../../lib/actionErrorMessage';
import { useEnterGuestKey } from './useEnterGuestKey';

const COULDNT_CHECK = 'Couldn’t check the key.';

// Only a 404 blames the list or key (ADR-016/054); any other status, whatever the server said, is not the key's fault.
function keyErrorMessage(error: Error): string {
  if (error instanceof ApiError && error.status === 404) return 'This list could not be found.';
  return isNetworkFailure(error) ? actionErrorMessage(error, COULDNT_CHECK) : ourEndMessage(COULDNT_CHECK);
}

export interface GuestKeyGateProps {
  slug: string;
  onSuccess: () => Promise<unknown>;
  /** The invite link's key: fills the input and is sent on mount, showing "Loading…" rather than the form until that first try settles. */
  linkKey?: string;
}

export function GuestKeyGate({ slug, onSuccess, linkKey }: GuestKeyGateProps) {
  const [key, setKey] = useState(linkKey ?? '');
  const { mutate, error, isPending, opening } = useEnterGuestKey(slug, onSuccess);
  const [autoSubmitting, setAutoSubmitting] = useState(linkKey !== undefined);

  useEffect(() => {
    if (linkKey === undefined) return;
    mutate({ key: linkKey.trim() }, { onSettled: () => setAutoSubmitting(false) });
  }, [linkKey, mutate]);

  if (autoSubmitting) return <>Loading…</>;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutate({ key: key.trim() });
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
        <p role="alert" className="text-error empty:mb-0">{error ? keyErrorMessage(error) : ''}</p>
        <button type="submit" disabled={isPending} className="btn-primary w-full">
          {opening ? 'Opening…' : isPending ? 'Checking…' : 'View list'}
        </button>
      </form>
    </div>
  );
}
