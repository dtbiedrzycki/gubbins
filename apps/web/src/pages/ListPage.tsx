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
    return <main className="min-h-screen bg-paper p-6 text-ink">Loading…</main>;
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
      <main className="min-h-screen bg-paper p-6 text-ink">
        <div className="mx-auto max-w-sm space-y-4">
          <p role="alert" className="text-error">{query.error.message}</p>
          <button type="button" autoFocus={retried} onClick={() => { setRetried(true); void query.refetch(); }} className="btn-primary">
            Try again
          </button>
        </div>
      </main>
    );
  }
  if (!query.data || sessionGone) {
    return (
      <main className="min-h-screen bg-paper p-6 text-ink">
        <GuestKeyGate slug={slug} onSuccess={() => query.refetch()} />
      </main>
    );
  }

  const items = query.data.items;
  const days = query.data.capabilities.holdDurationDays;
  return (
    <main className="min-h-screen bg-paper p-6 text-ink">
      <div className="mx-auto max-w-sm space-y-8">
        <header className="text-center">
          <h1 className="font-display text-[2.05rem] leading-tight text-balance break-words">{query.data.title}</h1>
          <p className="mt-2 text-muted">When you hold an item, it&apos;s held for you for {days} {days === 1 ? 'day' : 'days'}.</p>
          <span className="vine" aria-hidden="true" />
        </header>
        <p role="status" aria-live="polite" className="text-amber-800 empty:mb-0">{query.isRefetchError ? "Couldn't refresh the list, so it may be out of date." : ''}</p>
        {/* explicit role: Safari/VoiceOver drops list semantics under list-style none */}
        <ul role="list">
          {items.map((item) => (
            <li key={item.id} className="border-b border-line py-5">
              <ItemView
                slug={slug}
                item={item}
                holdDurationDays={days}
                payment={query.data.payment}
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
