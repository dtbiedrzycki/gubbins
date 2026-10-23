import type { FormEvent } from 'react';
import { useState } from 'react';
import { useCreateList } from './useCreateList';
import { LengthLimitWarning, isAtLimit } from '../../lib/LengthLimitWarning';

const TITLE_MAX = 120;
/** A Venmo username is at most 30 characters, plus the "@" people often type first. */
const VENMO_MAX = 31;
/** The longest email address there can be; the API caps the handle at the same length. */
const ZELLE_MAX = 254;

export function CreateListForm() {
  const [listTitle, setListTitle] = useState('');
  const [itemTitle, setItemTitle] = useState('');
  const [createSecret, setCreateSecret] = useState('');
  const [venmoHandle, setVenmoHandle] = useState('');
  const [zelleHandle, setZelleHandle] = useState('');
  const { mutate, data, error, isPending } = useCreateList();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutate({
      listTitle: listTitle.trim(), itemTitle: itemTitle.trim(), createSecret: createSecret.trim(),
      venmoHandle: venmoHandle.trim(), zelleHandle: zelleHandle.trim(),
    });
  }

  if (data) {
    return (
      <div className="max-w-sm space-y-3">
        <p>Your list is ready.</p>
        <div>
          <p className="text-sm font-medium">Guest link</p>
          <a data-testid="guest-link" className="text-blue-600 underline" href={`/${data.slug}`}>
            {window.location.origin}/{data.slug}
          </a>
        </div>
        <div>
          <p className="text-sm font-medium">Guest key</p>
          <p data-testid="guest-key" className="font-mono">{data.key}</p>
        </div>
        <div>
          {/* Never rendered inside a link — ADR-062: the owner token must never travel in a URL. */}
          <p className="text-sm font-medium">Owner token — keep this private</p>
          <p data-testid="owner-token" className="break-all font-mono">{data.ownerToken}</p>
        </div>
        <p>Save your owner token now: you'll need it to manage the list, and it isn't shown again.</p>
        {/* A new tab, so one tap cannot lose the only display of the owner token and guest key. */}
        <a className="text-blue-600 underline" href={`/${data.slug}/manage`} target="_blank" rel="noopener noreferrer">Manage your list <span className="sr-only">(opens in a new tab)</span></a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
      <div>
        <label htmlFor="list-title" className="block text-sm font-medium">List title</label>
        <input
          id="list-title" required maxLength={TITLE_MAX} aria-describedby="list-title-limit" value={listTitle} onChange={(e) => setListTitle(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
        <LengthLimitWarning id="list-title-limit" value={listTitle} max={TITLE_MAX} />
      </div>
      <div>
        <label htmlFor="item-title" className="block text-sm font-medium">First item</label>
        <input
          id="item-title" required maxLength={TITLE_MAX} aria-describedby="item-title-limit" value={itemTitle} onChange={(e) => setItemTitle(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
        <LengthLimitWarning id="item-title-limit" value={itemTitle} max={TITLE_MAX} />
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
        <input
          id="venmo-handle" aria-describedby={isAtLimit(venmoHandle, VENMO_MAX) ? 'handles-hint venmo-handle-limit' : 'handles-hint'} maxLength={VENMO_MAX} value={venmoHandle} onChange={(e) => setVenmoHandle(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
        <LengthLimitWarning id="venmo-handle-limit" value={venmoHandle} max={VENMO_MAX} />
      </div>
      <div>
        <label htmlFor="zelle-handle" className="block text-sm font-medium">Zelle email or US phone</label>
        <input
          id="zelle-handle" aria-describedby={isAtLimit(zelleHandle, ZELLE_MAX) ? 'handles-hint zelle-handle-limit' : 'handles-hint'} maxLength={ZELLE_MAX} value={zelleHandle} onChange={(e) => setZelleHandle(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
        <LengthLimitWarning id="zelle-handle-limit" value={zelleHandle} max={ZELLE_MAX} />
      </div>
      <p id="handles-hint" className="text-sm text-gray-600">Group gifts need at least one handle. Handles can't be changed later.</p>
      <p role="alert" className="text-red-600 empty:mb-0">{error?.message}</p>
      <button
        type="submit" disabled={isPending}
        className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? 'Creating…' : 'Create list'}
      </button>
    </form>
  );
}
