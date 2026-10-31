import { useEffect, useRef, useState } from 'react';
import type { ListViewResponse } from '@gubbins/shared-types';
import { useHoldItem } from './useHoldItem';
import { HoldDialog } from './HoldDialog';
import { ItemAnnouncement } from './ItemAnnouncement';
import { Seal } from './Seal';
import { formatMoney } from '../../lib/formatMoney';
import { ClampedText } from '../../lib/ClampedText';
import { Markdown } from '../../lib/Markdown';
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
  // Integer minor units, multiplied before dividing so the floor is exact; rounding down
  // keeps a gift short of its price from reading 100%.
  const pledgedPercent = group ? (group.pledged * 100) / group.price : 0;
  const progress = group && `${formatMoney(group.pledged)} of ${formatMoney(group.price)} pledged · ${Math.floor(pledgedPercent)}%`;

  // Status comes from the server alone. useHoldItem stays pending until the
  // refetched list view lands, and a remembered local success would go stale
  // the moment the guest releases or buys from "Your holds".
  return (
    <div className="space-y-4">
      <h2 className="font-display text-[1.3rem] leading-tight text-balance break-words">{item.title}</h2>
      {item.priceMinor !== null && <p className="font-bold tabular-nums">{formatMoney(item.priceMinor)}</p>}
      {item.description && <ClampedText id={`item-description-${item.id}`}><Markdown text={item.description} /></ClampedText>}
      {item.url && <p><a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-block py-2.5 text-moss underline">View in store <span className="sr-only">for {item.title} (opens in a new tab)</span></a></p>}
      {item.type === 'single' && item.status === 'available' && item.availableUnits > 1 && <p>{item.availableUnits} left</p>}
      {/* Mounted while available too: screen readers miss a live region that arrives already filled.
          While it's empty, the row adds no gap of its own. */}
      <div className="flex items-center gap-2.5 has-[>p:empty:only-child]:mb-0">
        {item.status !== 'available' && <Seal tone={item.status === 'purchased' ? 'gold-wax' : 'red-wax'} />}
        <ItemAnnouncement message={thanks || (item.status === 'available' ? '' : item.status === 'held' ? `${item.title} is held.` : `${item.title} has been purchased.`)} />
      </div>
      {group && (
        <>
          <progress max={group.price} value={Math.min(group.pledged, group.price)} aria-label={progress!} className="sr-only" />
          <div className="space-y-1.5">
            <p>{progress}</p>
            {/* Gold coins laid along a bar, filled to the pledged share and never past full. */}
            <div aria-hidden="true" className="h-4 overflow-hidden rounded-lg border-2 border-ink bg-white">
              <div data-bar-fill className="h-full bg-gold bg-[radial-gradient(circle_at_30%_50%,#F3D27A_0_3px,transparent_3.5px)] bg-[length:10px_12px]" style={{ width: `${Math.min(pledgedPercent, 100)}%` }} />
            </div>
          </div>
          <button ref={chipInButton} type="button" onClick={() => { setThanks(''); setChipInOpen(true); }} className="btn-primary">
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
        <button ref={holdButton} type="button" onClick={() => setDialogOpen(true)} className="btn-primary">
          Hold this item<span className="sr-only">: {item.title}</span>
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
