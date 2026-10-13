import { useEffect, useRef, useState } from 'react';
import type { ListViewResponse } from '@gubbins/shared-types';
import { useHoldItem } from './useHoldItem';
import { HoldDialog } from './HoldDialog';
import { HeldAnnouncement } from './HeldAnnouncement';
import { formatMoney } from '../../lib/formatMoney';
import { ContributeDialog } from '../contribute/ContributeDialog';

export interface ItemViewProps {
  slug: string;
  item: NonNullable<ListViewResponse['items']>[number];
  holdDurationDays: number;
  payment: ListViewResponse['payment'];
  /** Moves focus once the dialog has gone and the Hold button has too: the hold landed, or someone else's did. */
  focusElsewhere?: () => void;
}

export function ItemView({ slug, item, holdDurationDays, payment, focusElsewhere }: ItemViewProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [chipInOpen, setChipInOpen] = useState(false);
  const [thanks, setThanks] = useState('');
  const chipInButton = useRef<HTMLButtonElement>(null);
  // The Chip in button outlives the dialog, so focus goes back to it either way.
  const chipInClosed = useRef(false);
  useEffect(() => {
    if (chipInOpen || !chipInClosed.current) return;
    chipInClosed.current = false;
    chipInButton.current?.focus();
  }, [chipInOpen]);
  function closeChipIn() {
    chipInClosed.current = true;
    setChipInOpen(false);
  }
  const { mutate, isPending, error, reset } = useHoldItem(slug, item.id);
  const holdButton = useRef<HTMLButtonElement>(null);

  // Unmounting the dialog skips the browser's own focus return, and the page
  // is inert until the modal has gone, so move focus after the commit.
  // After a hold the button is about to go even if this render still has it.
  const closedBy = useRef<'cancel' | 'hold' | null>(null);
  useEffect(() => {
    if (dialogOpen || !closedBy.current) return;
    const button = closedBy.current === 'cancel' ? holdButton.current : null;
    closedBy.current = null;
    if (button) button.focus();
    else focusElsewhere?.();
  }, [dialogOpen, focusElsewhere]);

  function closeDialog() {
    closedBy.current = 'cancel';
    setDialogOpen(false);
    // The next opening starts clean: no stale error from this one.
    reset();
  }

  const group = item.type === 'group' && item.priceMinor !== null
    ? { price: item.priceMinor, pledged: item.pledgedMinor ?? 0 }
    : null;
  const progress = group && `${formatMoney(group.pledged)} of ${formatMoney(group.price)} pledged · ${Math.floor((group.pledged / group.price) * 100)}%`;

  // Status comes from the server alone. useHoldItem stays pending until the
  // refetched list view lands, and a remembered local success would go stale
  // the moment the guest releases or buys from "Your holds".
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{item.title}</h2>
      {item.priceMinor !== null && <p>{formatMoney(item.priceMinor)}</p>}
      {item.url && <p><a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">View in store</a></p>}
      {item.type === 'single' && <p>{item.availableUnits} left</p>}
      {/* Mounted while available too: screen readers miss a live region that arrives already filled. */}
      <HeldAnnouncement message={thanks || (item.status === 'available' ? '' : item.status === 'held' ? `${item.title} is held.` : `${item.title} has been purchased.`)} />
      {group && (
        <>
          <progress max={group.price} value={Math.min(group.pledged, group.price)} aria-label={progress!} className="h-3 w-full" />
          <p>{progress}</p>
          <button ref={chipInButton} type="button" onClick={() => { setThanks(''); setChipInOpen(true); }} className="min-h-11 rounded bg-slate-900 px-4 py-2 text-white">
            Chip in
          </button>
        </>
      )}
      {chipInOpen && group && (
        <ContributeDialog
          slug={slug}
          itemId={item.id}
          itemTitle={item.title}
          remainingMinor={Math.max(group.price - group.pledged, 0)}
          payment={payment}
          onPledged={(amountMinor) => { setThanks(`Thank you! Your pledge of ${formatMoney(amountMinor)} is recorded.`); closeChipIn(); }}
          onClose={closeChipIn}
        />
      )}
      {item.type === 'single' && item.status === 'available' && (
        <button ref={holdButton} type="button" onClick={() => setDialogOpen(true)} className="min-h-11 rounded bg-slate-900 px-4 py-2 text-white">
          Hold this item
        </button>
      )}
      {dialogOpen && (
        <HoldDialog
          itemTitle={item.title}
          holdDurationDays={holdDurationDays}
          isPending={isPending}
          error={error}
          onConfirm={(credential, details) => mutate({ idempotencyKey: credential.idempotencyKey, ...details }, { onSuccess: () => { closedBy.current = 'hold'; setDialogOpen(false); } })}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}
