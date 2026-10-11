import { useState } from 'react';
import type { HoldView } from '@gubbins/shared-types';
import { HoldActions } from './HoldActions';
import { formatExpiry } from './formatExpiry';

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
 * "Your holds": this session's holds, each with its
 * expiry and the actions it offers. The live region stays mounted even when
 * the list empties, so a release is still announced after the last hold
 * disappears (ADR-0025).
 */
export function YourHolds({ slug, holds, itemTitles }: YourHoldsProps) {
  const [announcement, setAnnouncement] = useState('');

  return (
    <section aria-labelledby="your-holds-heading" className="space-y-3">
      <h2 id="your-holds-heading" className="text-lg font-semibold">Your holds</h2>
      <p role="status" aria-live="polite" className="font-medium text-green-700">{announcement}</p>
      {holds.length === 0 ? (
        <p className="text-slate-600">Holds you place appear here.</p>
      ) : (
        <ul className="space-y-3">
          {holds.map((hold) => {
            const itemTitle = itemTitles[hold.itemId] ?? 'This item';
            return (
              <li key={hold.holdId} className="space-y-2 rounded border border-slate-200 bg-white p-4">
                <h3 className="font-medium">{itemTitle}</h3>
                <p>{statusLine(hold)}</p>
                <HoldActions slug={slug} hold={hold} itemTitle={itemTitle} onAnnounce={setAnnouncement} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
