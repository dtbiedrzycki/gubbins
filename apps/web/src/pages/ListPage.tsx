import { useParams } from 'react-router-dom';
import { useListView } from '../features/holds/useListView';
import { GuestKeyGate } from '../features/guest-key/GuestKeyGate';
import { ItemView } from '../features/holds/ItemView';

export default function ListPage() {
  const { slug } = useParams<{ slug: string }>();
  // useListView must be called unconditionally (react-hooks/rules-of-hooks);
  // the '' fallback is never actually queried since we return null below
  // before anything depending on `query` renders.
  const query = useListView(slug ?? '');
  if (!slug) return null;

  if (query.status === 'pending') {
    return <main className="min-h-screen bg-slate-50 p-6">Loading…</main>;
  }

  if (query.status === 'error') {
    // Any error here — 401 (no session yet) or 404 (unknown slug) — means
    // "not authenticated yet"; the backend already collapses both into
    // the same generic shape (ADR-016/054), so this branch doesn't need
    // to (and mustn't) distinguish further.
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <GuestKeyGate slug={slug} onSuccess={() => query.refetch()} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <ItemView slug={slug} listTitle={query.data.title} item={query.data.item} />
    </main>
  );
}
