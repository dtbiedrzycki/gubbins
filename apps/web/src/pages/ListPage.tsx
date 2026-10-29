import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useListView } from '../features/holds/useListView';
import { GuestKeyGate } from '../features/guest-key/GuestKeyGate';
import { ApiError } from '../api/client';
import { ItemView } from '../features/holds/ItemView';
import { HowHoldingWorks } from '../features/holds/HowHoldingWorks';
import { ItemFilter, filterKey, type ItemFilterValue } from '../features/holds/ItemFilter';
import { ClampedText } from '../lib/ClampedText';
import { Markdown } from '../lib/Markdown';
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
  // The ids are fixed when the guest picks a filter, so a gift that changes state stays shown (with any open dialog) until they pick again.
  const [filter, setFilter] = useState<{ value: ItemFilterValue; ids?: Set<string> }>({ value: 'all' });
  if (!slug) return null;

  if (query.status === 'pending') {
    return <main className="flex-1 bg-paper p-6 text-ink">Loading…</main>;
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
      <main className="flex-1 bg-paper p-6 text-ink">
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
      <main className="flex-1 bg-paper p-6 text-ink">
        <GuestKeyGate slug={slug} onSuccess={() => query.refetch()} />
      </main>
    );
  }

  const items = query.data.items;
  const days = query.data.capabilities.holdDurationDays;
  const shown = filter.ids ? items.filter((i) => filter.ids!.has(i.id)) : items;
  const chooseFilter = (value: ItemFilterValue) =>
    setFilter({ value, ids: value === 'all' ? undefined : new Set(items.filter((i) => filterKey(i) === value).map((i) => i.id)) });
  // A guest with a hold already saw the box when they held; with nothing to hold, it explains nothing.
  const canHold = items.some((item) => item.type === 'single' && item.status === 'available');
  return (
    <main className="flex-1 bg-paper p-6 text-ink">
      <div className="mx-auto max-w-sm space-y-8">
        <header className="text-center">
          <h1 className="font-display text-[2.05rem] leading-tight text-balance break-words">{query.data.title}</h1>
          <span className="vine" aria-hidden="true" />
        </header>
        {query.data.description && (
          <section aria-label="About this list">
            <ClampedText id="list-description" rememberAs="gubbins.listDescription"><Markdown text={query.data.description} /></ClampedText>
          </section>
        )}
        {canHold && (
          <HowHoldingWorks
            holdDurationDays={days}
            // The card is going; the gift filter comes next.
            onDismiss={() => document.querySelector<HTMLButtonElement>('[aria-label="Show gifts"] button')?.focus()}
          />
        )}
        <p role="status" aria-live="polite" className="text-amber-800 empty:mb-0">{query.isRefetchError ? "Couldn't refresh the list, so it may be out of date." : ''}</p>
        <ItemFilter items={items} value={filter.value} onChange={chooseFilter} />
        {/* explicit role: Safari/VoiceOver drops list semantics under list-style none */}
        {shown.length === 0 ? (
          <p className="text-center">{filter.value === 'available' && items.length > 0 ? 'Every gift is already held, purchased or funded.' : 'No gifts here yet.'}</p>
        ) : (
        <ul role="list">
          {shown.map((item) => (
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
        )}
        <YourHolds slug={slug} holds={query.data.myHolds} itemTitles={Object.fromEntries(items.map((i) => [i.id, i.title]))} />
      </div>
    </main>
  );
}
