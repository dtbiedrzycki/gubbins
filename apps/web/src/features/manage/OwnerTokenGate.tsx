import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';

export interface OwnerTokenGateProps {
  slug: string;
  onSuccess: () => void;
  /** Shown up front, e.g. when the owner's session was rejected mid-task. */
  notice?: string;
}

export function OwnerTokenGate({ slug, onSuccess, notice }: OwnerTokenGateProps) {
  // The token lives only in this state: never in a URL or storage (ADR-062).
  const [ownerToken, setOwnerToken] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const { mutate, error, isPending } = useMutation({
    mutationFn: () => api.enterOwnerToken(slug, { ownerToken: ownerToken.trim() }),
  });
  // Sent back here by the page: put focus where the next step is.
  useEffect(() => { if (notice) input.current?.focus(); }, [notice]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutate(undefined, { onSuccess });
  }

  const message = error
    ? (error instanceof ApiError && error.status === 404 ? "That isn't the owner token for this list." : error.message)
    : '';
  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
      <div>
        <label htmlFor="owner-token" className="block text-sm font-medium">Owner token</label>
        <input
          ref={input} id="owner-token" type="password" required autoComplete="off" aria-describedby="owner-token-message" value={ownerToken}
          onChange={(e) => setOwnerToken(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <p id="owner-token-message" role="alert" className="text-red-600 empty:mb-0">{message || notice}</p>
      <button
        type="submit" disabled={isPending}
        className="min-h-11 rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? 'Checking…' : 'Manage list'}
      </button>
    </form>
  );
}
