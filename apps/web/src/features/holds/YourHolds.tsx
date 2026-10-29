import { useRef, useState } from 'react';
import type { HoldView } from '@gubbins/shared-types';
import { HoldActions, type HoldOutcome } from './HoldActions';
import { formatExpiry } from './formatExpiry';
import { Seal } from './Seal';

export interface YourHoldsProps {
  slug: string;
  holds: HoldView[];
  itemTitles: Record<string, string>;
}

function statusLine(hold: HoldView): string {
  switch (hold.status) {
    case 'active':
      return `Held until ${formatExpiry(hold.expiresAt)}${hold.extendedAt ? ' (extended)' : ''}.`;
    case 'expired':
      return hold.actions.purchase
        ? `Your hold expired on ${formatExpiry(hold.expiresAt)}. You can still mark it as purchased.`
        : `Your hold expired on ${formatExpiry(hold.expiresAt)}.`;
    case 'purchased':
      return 'Marked as purchased.';
    case 'released':
      return 'Released.';
  }
}

/**
 * "Your holds": this session's holds, each with its expiry and the actions it
 * offers. Outcomes are shown here, not on the hold's card: the refetch after
 * an action can remove the card (a release, or a hold already released in
 * another tab). Both live regions stay mounted, even when the list empties
 * (ADR-0025). Feedback clears when the next action starts, so a repeated
 * message is announced again. A "released" message also clears when a new
 * hold appears, which it would contradict; other messages stay to be read.
 */
export function YourHolds({ slug, holds, itemTitles }: YourHoldsProps) {
  const [outcome, setOutcome] = useState<HoldOutcome | null>(null);
  const sectionHeading = useRef<HTMLHeadingElement>(null);
  const cardHeadings = useRef(new Map<string, HTMLHeadingElement>());
  const holdIds = holds.map((hold) => hold.holdId);
  const [knownHoldIds, setKnownHoldIds] = useState(holdIds);
  // Only a hold that appears while the page is open gets its seal stamped in.
  const [initialHoldIds] = useState(() => new Set(holdIds));
  if (holdIds.some((id) => !knownHoldIds.includes(id))) {
    setKnownHoldIds(holdIds);
    if (outcome?.ok && outcome.action === 'release') setOutcome(null);
  }

  // The pressed button is disabled in flight and often gone after, so focus
  // moves to something that outlives the refetch: the hold's own heading if
  // its card stays, otherwise the section heading beside the feedback.
  function showOutcome(holdId: string, next: HoldOutcome) {
    setOutcome(next);
    const card = next.ok && next.action !== 'release' ? cardHeadings.current.get(holdId) : undefined;
    (card ?? sectionHeading.current)?.focus();
  }

  return (
    <section aria-labelledby="your-holds-heading" className="space-y-3 break-words rounded-[18px] border-[1.5px] border-line bg-white p-4">
      <h2 ref={sectionHeading} id="your-holds-heading" tabIndex={-1} className="font-display text-2xl">Your holds</h2>
      <p role="status" aria-live="polite" className="font-bold text-moss">{outcome?.ok ? outcome.message : ''}</p>
      <p role="alert" className="text-error">{outcome && !outcome.ok ? outcome.message : ''}</p>
      {holds.length === 0 ? (
        <p className="text-muted">Holds you place appear here.</p>
      ) : (
        <ul className="space-y-3">
          {holds.map((hold) => {
            const itemTitle = itemTitles[hold.itemId] ?? 'This item';
            return (
              <li key={hold.holdId} className="space-y-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-center gap-2.5">
                  {(hold.status === 'active' || hold.status === 'purchased') && <Seal tone={hold.status === 'purchased' ? 'gold-wax' : 'red-wax'} stamp={!initialHoldIds.has(hold.holdId)} />}
                  <h3
                    ref={(el) => {
                      if (el) cardHeadings.current.set(hold.holdId, el);
                      return () => { cardHeadings.current.delete(hold.holdId); };
                    }}
                    tabIndex={-1}
                    className="min-w-0 font-bold"
                  >
                    {itemTitle}
                  </h3>
                </div>
                <p>{statusLine(hold)}</p>
                <HoldActions slug={slug} hold={hold} itemTitle={itemTitle} onStart={() => setOutcome(null)} onOutcome={(next) => showOutcome(hold.holdId, next)} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
