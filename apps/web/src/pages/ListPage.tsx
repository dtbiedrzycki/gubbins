import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useListView } from '../features/holds/useListView';
import { GuestKeyGate } from '../features/guest-key/GuestKeyGate';
import { ApiError } from '../api/client';
import { ItemView } from '../features/holds/ItemView';
import { YourHolds } from '../features/holds/YourHolds';

export default function ListPage() {
  const { slug } = useParams<{ slug: string }>();
  // useListView must be called unconditionally (react-hooks/rules-of-hooks);
  // it internally disables the query via `enabled: Boolean(slug)` when slug
  // is undefined, so no request fires before the guard below returns.
  const query = useListView(slug);
  // "Try again" sends the query back to pending, which unmounts the error
  // view; this outlives it so a failed retry can hand focus back.
  const [retried, setRetried] = useState(false);
  if (!slug) return null;

  if (query.status === 'pending') {
    return <main className="min-h-screen bg-slate-50 p-6">Loading…</main>;
  }

  // 401 (no session yet) and 404 (unknown slug) both mean "enter the key":
  // the backend already collapses them into the same generic shape
  // (ADR-016/054), so this doesn't (and mustn't) distinguish further. Any
  // other error on the first load is the server or network, which a key
  // can't fix. Once the list has loaded, a failed background refetch keeps it.
  const sessionGone = query.error instanceof ApiError && (query.error.status === 401 || query.error.status === 404);
  if (!query.data && query.error && !sessionGone) {
    // The alert is this view's content, mounted with it, so it is announced
    // on arrival; focus stays put the first time, since the guest didn't ask
    // for this view, but returns to the button after a failed "Try again".
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-sm space-y-4">
          <p role="alert" className="text-red-600">{query.error.message}</p>
          <button type="button" autoFocus={retried} onClick={() => { setRetried(true); void query.refetch(); }} className="min-h-11 rounded bg-slate-900 px-4 py-2 text-white">
            Try again
          </button>
        </div>
      </main>
    );
  }
  if (!query.data || sessionGone) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <GuestKeyGate slug={slug} onSuccess={() => query.refetch()} />
      </main>
    );
  }

  const items = query.data.items ?? [];
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-sm space-y-8">
        <h1 className="text-2xl font-semibold">{query.data.title}</h1>
        <p role="status" aria-live="polite" className="text-amber-800 empty:mb-0">{query.isRefetchError ? "Couldn't refresh the list, so it may be out of date." : ''}</p>
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.id} className="rounded border border-slate-200 bg-white p-4">
              <ItemView
                slug={slug}
                item={item}
                holdDurationDays={query.data.capabilities.holdDurationDays}
                // The Hold button has gone; the new hold's actions are under Your holds.
                focusElsewhere={() => document.getElementById('your-holds-heading')?.focus()}
              />
            </li>
          ))}
        </ul>
        <YourHolds slug={slug} holds={query.data.myHolds} itemTitles={Object.fromEntries(items.map((i) => [i.id, i.title]))} />
      </div>
    </main>
  );
}
