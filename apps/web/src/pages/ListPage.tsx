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
  if (!slug) return null;

  if (query.status === 'pending') {
    return <main className="min-h-screen bg-slate-50 p-6">Loading…</main>;
  }

  // With no list yet, any error — 401 (no session yet) or 404 (unknown slug)
  // — means "not authenticated yet"; the backend already collapses both into
  // the same generic shape (ADR-016/054), so this doesn't (and mustn't)
  // distinguish further. Once the list has loaded, only those two send the
  // guest back to the key: a failed background refetch keeps the page.
  const sessionGone = query.error instanceof ApiError && (query.error.status === 401 || query.error.status === 404);
  if (!query.data || sessionGone) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <GuestKeyGate slug={slug} onSuccess={() => query.refetch()} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-sm space-y-8">
        <ItemView
          slug={slug}
          listTitle={query.data.title}
          item={query.data.item}
          holdDurationDays={query.data.capabilities.holdDurationDays}
          // The Hold button has gone; the new hold's actions are under Your holds.
          focusElsewhere={() => document.getElementById('your-holds-heading')?.focus()}
        />
        <YourHolds slug={slug} holds={query.data.myHolds} itemTitles={{ [query.data.item.id]: query.data.item.title }} />
      </div>
    </main>
  );
}
