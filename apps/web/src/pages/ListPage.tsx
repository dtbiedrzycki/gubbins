import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useListView } from '../features/holds/useListView';
import { GuestKeyGate } from '../features/guest-key/GuestKeyGate';
import { readFragmentKey } from '../features/guest-key/fragmentKey';
import { ApiError } from '../api/client';
import { ItemView } from '../features/holds/ItemView';
import { HowHoldingWorks } from '../features/holds/HowHoldingWorks';
import { HowGroupGiftsWork } from '../features/contribute/HowGroupGiftsWork';
import { ItemFilter, filterKey, type ItemFilterValue } from '../features/holds/ItemFilter';
import { ClampedText } from '../lib/ClampedText';
import { Markdown } from '../lib/Markdown';
import { YourContributions } from '../features/holds/YourContributions';

export default function ListPage() {
  const { slug } = useParams<{ slug: string }>();
  // useListView must be called unconditionally (react-hooks/rules-of-hooks);
  // it internally disables the query via `enabled: Boolean(slug)` when slug
  // is undefined, so no request fires before the guard below returns.
  const query = useListView(slug);
  const location = useLocation();
  const navigate = useNavigate();
  // An invite link carries the key in the fragment, which the browser never sends to the server (ADR-0067).
  const [link] = useState(() => readFragmentKey(location.hash));
  // One try per page load: once the key is accepted, a later key screen (session ended, cookies blocked) starts empty.
  const [linkKey, setLinkKey] = useState(link.key);
  useEffect(() => {
    // Through the router, so its location matches the address bar.
    if (link.key) navigate({ pathname: location.pathname, search: location.search, hash: link.rest }, { replace: true });
    // Once, on arrival: the location this sees is the one the key was read from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // "Try again" sends the query back to pending, which unmounts the error
  // view; this outlives it so a failed retry can hand focus back.
  const [retried, setRetried] = useState(false);
  // The ids are fixed when the guest picks a filter, so a gift that changes state stays shown (with any open dialog) until they pick again.
  const [filter, setFilter] = useState<{ value: ItemFilterValue; ids?: Set<string> }>({ value: 'all' });
  const title = useRef<HTMLHeadingElement>(null);
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
        <GuestKeyGate
          slug={slug}
          onSuccess={() => { setLinkKey(null); return query.refetch(); }}
          linkKey={linkKey ?? undefined}
        />
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
  // Once every group gift is funded there is nothing left to chip in to.
  const canChipIn = items.some((item) => item.type === 'group' && filterKey(item) === 'available');
  // The card is going; the gift filter comes next.
  const focusFilter = () => document.querySelector<HTMLButtonElement>('[aria-label="Show gifts"] button')?.focus();
  const hasContributions = query.data.myHolds.length + query.data.myContributions.length > 0;
  return (
    // While the floating "Your contributions" button shows, the end of the page leaves room for it, so it never covers the last gift:
    // pb-24 (6rem) clears the button's 2.75rem height and 1rem gap from the bottom, with room to spare.
    // scroll-mb-24 does the same for a control that Tab scrolls into view mid-list.
    <main className={`flex-1 bg-paper p-6 text-ink ${hasContributions ? 'pb-24 [&_*]:scroll-mb-24' : ''}`}>
      <div className="mx-auto max-w-sm space-y-8">
        <header className="text-center">
          <h1 ref={title} tabIndex={-1} className="font-display text-[2.05rem] leading-tight text-balance break-words">{query.data.title}</h1>
          <span className="vine" aria-hidden="true" />
          {/* Here, so an outcome that empties the sheet shows beside the title that takes focus. */}
          <YourContributions slug={slug} holds={query.data.myHolds} contributions={query.data.myContributions}
            itemTitles={Object.fromEntries(items.map((i) => [i.id, i.title]))} onEmptied={() => title.current?.focus()} />
        </header>
        {query.data.description && (
          <section aria-label="About this list">
            <ClampedText id="list-description" rememberAs="gubbins.listDescription"><Markdown text={query.data.description} /></ClampedText>
          </section>
        )}
        {canHold && (
          <HowHoldingWorks
            holdDurationDays={days}
            // The group-gift card comes next when it shows, so keyboard users don't skip it.
            onDismiss={() => {
              const groupDismiss = document.querySelector<HTMLButtonElement>('[aria-labelledby="how-group-gifts-title"] button');
              if (groupDismiss) groupDismiss.focus(); else focusFilter();
            }}
          />
        )}
        {canChipIn && <HowGroupGiftsWork onDismiss={focusFilter} />}
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
                heldUnits={query.data.myHolds.filter((h) => h.itemId === item.id && h.status === 'active').reduce((sum, h) => sum + h.units, 0)}
                chippedInMinor={query.data.myContributions.filter((c) => c.itemId === item.id).reduce((sum, c) => sum + c.amountMinor, 0)}
              />
            </li>
          ))}
        </ul>
        )}
      </div>
    </main>
  );
}
