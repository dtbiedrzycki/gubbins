import type { FormEvent } from 'react';
import { useState } from 'react';
import { useCreateList } from './useCreateList';

export function CreateListForm() {
  const [listTitle, setListTitle] = useState('');
  const [itemTitle, setItemTitle] = useState('');
  const { mutate, data, error, isPending } = useCreateList();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutate({ listTitle, itemTitle });
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
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
      <div>
        <label htmlFor="list-title" className="block text-sm font-medium">List title</label>
        <input
          id="list-title" required value={listTitle} onChange={(e) => setListTitle(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="item-title" className="block text-sm font-medium">First item</label>
        <input
          id="item-title" required value={itemTitle} onChange={(e) => setItemTitle(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </div>
      {error && <p role="alert" className="text-red-600">{error.message}</p>}
      <button
        type="submit" disabled={isPending}
        className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? 'Creating…' : 'Create list'}
      </button>
    </form>
  );
}
