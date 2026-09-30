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
    mutate({ key }, { onSuccess });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
      <div>
        <label htmlFor="guest-key" className="block text-sm font-medium">Enter the guest key</label>
        <input
          id="guest-key" required value={key} onChange={(e) => setKey(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      {/* Deliberately generic regardless of the underlying reason — ADR-016/054: no distinguishing "wrong key" from "no such list." */}
      {error && <p role="alert" className="text-red-600">This list could not be found.</p>}
      <button
        type="submit" disabled={isPending}
        className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? 'Checking…' : 'View list'}
      </button>
    </form>
  );
}
