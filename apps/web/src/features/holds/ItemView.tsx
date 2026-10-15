import { useEffect, useRef, useState } from 'react';
import type { ListViewResponse } from '@gubbins/shared-types';
import { useHoldItem } from './useHoldItem';
import { HoldDialog } from './HoldDialog';
import { HeldAnnouncement } from './HeldAnnouncement';
import { formatMoney } from '../../lib/formatMoney';

export interface ItemViewProps {
  slug: string;
  item: NonNullable<ListViewResponse['items']>[number];
  holdDurationDays: number;
  /** Moves focus once the dialog has gone and the Hold button has too: the hold landed, or someone else's did. */
  focusElsewhere?: () => void;
}

export function ItemView({ slug, item, holdDurationDays, focusElsewhere }: ItemViewProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
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

  // Status comes from the server alone. useHoldItem stays pending until the
  // refetched list view lands, and a remembered local success would go stale
  // the moment the guest releases or buys from "Your holds".
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{item.title}</h2>
      {item.priceMinor !== null && <p>{formatMoney(item.priceMinor)}</p>}
      {item.url && <p><a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-block py-2.5 text-blue-700 underline">View in store <span className="sr-only">for {item.title} (opens in a new tab)</span></a></p>}
      {item.type === 'single' && item.status === 'available' && item.availableUnits > 1 && <p>{item.availableUnits} left</p>}
      {/* Mounted while available too: screen readers miss a live region that arrives already filled. */}
      <HeldAnnouncement message={item.status === 'available' ? '' : item.status === 'held' ? `${item.title} is held.` : `${item.title} has been purchased.`} />
      {item.type === 'single' && item.status === 'available' && (
        <button ref={holdButton} type="button" onClick={() => setDialogOpen(true)} className="min-h-11 rounded bg-slate-900 px-4 py-2 text-white">
          Hold this item<span className="sr-only">: {item.title}</span>
        </button>
      )}
      {dialogOpen && (
        <HoldDialog
          itemTitle={item.title}
          holdDurationDays={holdDurationDays}
          isPending={isPending}
          error={error}
          onConfirm={(credential) => mutate({ idempotencyKey: credential.idempotencyKey }, { onSuccess: () => { closedBy.current = 'hold'; setDialogOpen(false); } })}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}
