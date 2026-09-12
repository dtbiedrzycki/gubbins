import { useState } from 'react';
import type { ListViewResponse } from '@gubbins/shared-types';
import { useHoldItem } from './useHoldItem';
import { HoldDialog } from './HoldDialog';
import { HeldAnnouncement } from './HeldAnnouncement';

export interface ItemViewProps {
  slug: string;
  listTitle: string;
  item: ListViewResponse['item'];
}

export function ItemView({ slug, listTitle, item }: ItemViewProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { mutate, isPending, error, isSuccess } = useHoldItem(slug, item.id);

  function handleConfirm() {
    // Client-generated idempotency key — ADR-048.
    mutate({ idempotencyKey: crypto.randomUUID() }, { onSuccess: () => setDialogOpen(false) });
  }

  const isHeld = item.status === 'held' || isSuccess;

  return (
    <div className="max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold">{listTitle}</h1>
      <p>{item.title}</p>
      {isHeld ? (
        <HeldAnnouncement message={`${item.title} is held.`} />
      ) : (
        <button type="button" onClick={() => setDialogOpen(true)} className="rounded bg-slate-900 px-4 py-2 text-white">
          Hold this item
        </button>
      )}
      <HoldDialog
        itemTitle={item.title}
        isOpen={dialogOpen}
        isPending={isPending}
        error={error}
        onConfirm={handleConfirm}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  );
}
