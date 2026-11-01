import type { FormEvent } from 'react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useCreateList } from './useCreateList';
import { LimitedInput, LimitedTextarea } from '../../lib/LimitedField';
import { listPath, managePath } from '../../lib/links';

const TITLE_MAX = 120;
/** A Venmo username is at most 30 characters, plus the "@" people often type first. */
const VENMO_MAX = 31;
/** The longest email address there can be; the API caps the handle at the same length. */
const ZELLE_MAX = 254;
/** Room for a greeting, a shipping address and a few links; the domain enforces the same cap. */
const DESCRIPTION_MAX = 2000;

export function CreateListForm() {
  const [listTitle, setListTitle] = useState('');
  const [createSecret, setCreateSecret] = useState('');
  const [venmoHandle, setVenmoHandle] = useState('');
  const [zelleHandle, setZelleHandle] = useState('');
  const [description, setDescription] = useState('');
  const { mutate, data, error, isPending } = useCreateList();
  const suggestion = useQuery({
    queryKey: ['guest-key-suggestion'], queryFn: api.suggestGuestKey,
    staleTime: Infinity, refetchOnWindowFocus: false, retry: false,
  });
  const suggestedKey = suggestion.data?.key;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!suggestedKey) return;
    const listDescription = description.trim();
    mutate({
      listTitle: listTitle.trim(), key: suggestedKey, createSecret: createSecret.trim(),
      venmoHandle: venmoHandle.trim(), zelleHandle: zelleHandle.trim(),
      ...(listDescription && { listDescription }),
    });
  }

  if (data) {
    return (
      <div className="max-w-sm space-y-3">
        <p>Your list is ready.</p>
        <div>
          <p className="text-sm font-medium">Guest link</p>
          <a data-testid="guest-link" className="text-blue-600 underline" href={listPath(data.slug)}>
            {window.location.origin}{listPath(data.slug)}
          </a>
        </div>
        <div>
          <p className="text-sm font-medium">Guest key</p>
          <p data-testid="guest-key" className="text-2xl font-bold">{data.key}</p>
        </div>
        <div>
          {/* Never rendered inside a link — ADR-062: the owner token must never travel in a URL. */}
          <p className="text-sm font-medium">Owner token — keep this private</p>
          <p data-testid="owner-token" className="break-all font-mono">{data.ownerToken}</p>
        </div>
        <p>Save your owner token now: you'll need it to manage the list, and it isn't shown again.</p>
        {/* A new tab, so one tap cannot lose the only display of the owner token and guest key. */}
        <a className="text-blue-600 underline" href={managePath(data.slug)} target="_blank" rel="noopener noreferrer">Manage your list <span className="sr-only">(opens in a new tab)</span></a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
      <div>
        <label htmlFor="list-title" className="block text-sm font-medium">List title</label>
        <LimitedInput
          id="list-title" required max={TITLE_MAX} value={listTitle} onChange={(e) => setListTitle(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <section aria-labelledby="guest-key-heading">
        <h2 id="guest-key-heading" className="text-sm font-medium">Guest key</h2>
        <div className="mt-1 flex items-center gap-3">
          <p aria-live="polite" className="grow wrap-anywhere text-2xl font-bold">{suggestedKey}</p>
          <button
            type="button" onClick={() => void suggestion.refetch()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded border border-gray-300 px-3 py-2"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 3v6h6" />
            </svg>
            Regenerate
          </button>
        </div>
        <p className="mt-1 text-sm text-gray-600">Guests type this to open your list. You can’t change it once the list is created.</p>
      </section>
      <div>
        <label htmlFor="list-description" className="block text-sm font-medium">About this list (optional)</label>
        <LimitedTextarea
          id="list-description" describedBy={['list-description-hint']} rows={5} max={DESCRIPTION_MAX} value={description} onChange={(e) => setDescription(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
        <p id="list-description-hint" className="mt-1 text-sm text-gray-600">Guests see this above your list. If you want gifts mailed, add your shipping address here. Supports **bold**, *italics*, lists and links.</p>
      </div>
      <div>
        <label htmlFor="create-secret" className="block text-sm font-medium">Create secret</label>
        <input
          id="create-secret" type="password" required value={createSecret}
          onChange={(e) => setCreateSecret(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="venmo-handle" className="block text-sm font-medium">Venmo username</label>
        <LimitedInput
          id="venmo-handle" describedBy={['handles-hint']} max={VENMO_MAX} value={venmoHandle} onChange={(e) => setVenmoHandle(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="zelle-handle" className="block text-sm font-medium">Zelle email or US phone</label>
        <LimitedInput
          id="zelle-handle" describedBy={['handles-hint']} max={ZELLE_MAX} value={zelleHandle} onChange={(e) => setZelleHandle(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <p id="handles-hint" className="text-sm text-gray-600">Group gifts need at least one handle. Handles can't be changed later.</p>
      <p role="alert" className="text-red-600 empty:mb-0">{error?.message ?? suggestion.error?.message}</p>
      <button
        type="submit" disabled={isPending || !suggestedKey}
        className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? 'Creating…' : 'Create list'}
      </button>
    </form>
  );
}
