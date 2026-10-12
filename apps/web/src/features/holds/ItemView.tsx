import { useEffect, useRef, useState } from 'react';
import type { ListViewResponse } from '@gubbins/shared-types';
import { useHoldItem } from './useHoldItem';
import { HoldDialog } from './HoldDialog';
import { HeldAnnouncement } from './HeldAnnouncement';

export interface ItemViewProps {
  slug: string;
  listTitle: string;
  item: ListViewResponse['item'];
  holdDurationDays: number;
  /** Called once a hold has landed and the dialog has gone; the Hold button has gone with it. */
  onHeld?: () => void;
}

export function ItemView({ slug, listTitle, item, holdDurationDays, onHeld }: ItemViewProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { mutate, isPending, error, reset } = useHoldItem(slug, item.id);
  const holdButton = useRef<HTMLButtonElement>(null);
  const closedBy = useRef<'cancel' | 'hold' | null>(null);

  // Unmounting the dialog skips the browser's own focus return, and the page
  // is inert until the modal has gone, so move focus after the commit.
  useEffect(() => {
    if (dialogOpen || !closedBy.current) return;
    if (closedBy.current === 'cancel') holdButton.current?.focus();
    else onHeld?.();
    closedBy.current = null;
  }, [dialogOpen, onHeld]);

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
      <h1 className="text-2xl font-semibold">{listTitle}</h1>
      <p>{item.title}</p>
      {item.status === 'available' ? (
        <button ref={holdButton} type="button" onClick={() => setDialogOpen(true)} className="min-h-11 rounded bg-slate-900 px-4 py-2 text-white">
          Hold this item
        </button>
      ) : (
        <HeldAnnouncement message={item.status === 'held' ? `${item.title} is held.` : `${item.title} has been purchased.`} />
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
