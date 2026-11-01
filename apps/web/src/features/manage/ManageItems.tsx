import { useEffect, useRef, useState } from 'react';
import type { ManageViewResponse } from '@gubbins/shared-types';
import { formatMoney } from '../../lib/formatMoney';
import { EditItemForm } from './EditItemForm';

export interface ManageItemsProps {
  slug: string;
  items: ManageViewResponse['items'];
  /** The server no longer accepts the owner cookie (404). */
  onUnauthorized: () => void;
}

export function ManageItems({ slug, items, onUnauthorized }: ManageItemsProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const restoreFocusTo = useRef<string | null>(null);
  // The Edit button is unmounted while its form shows, so focus returns to it once it is back.
  useEffect(() => {
    if (editingId === null && restoreFocusTo.current) {
      document.getElementById(`edit-item-${restoreFocusTo.current}`)?.focus();
      restoreFocusTo.current = null;
    }
  }, [editingId]);
  return (
    <section aria-labelledby="manage-items-heading" className="space-y-2">
      <h2 id="manage-items-heading" className="text-[0.8rem] font-bold uppercase tracking-[0.06em] text-muted">Items</h2>
      <ul role="list" className="space-y-2">
        {items.map((item) => {
          // A group gift always has a price; the type is nullable only because singles may lack one.
          const meta = item.type === 'group'
            ? `${formatMoney(item.priceMinor ?? 0)} target`
            : [item.priceMinor === null ? null : formatMoney(item.priceMinor), `quantity ${item.quantity}`].filter(Boolean).join(' · ');
          if (item.id === editingId) {
            return (
              <li key={item.id} className="grid gap-3 rounded-[10px] border border-line bg-white px-3.5 py-3">
                <h3 className="text-lg font-semibold">Edit item</h3>
                <EditItemForm
                  slug={slug} item={item} onUnauthorized={onUnauthorized}
                  onDone={() => { restoreFocusTo.current = item.id; setEditingId(null); }}
                />
              </li>
            );
          }
          return (
            <li key={item.id} className="grid gap-2 rounded-[10px] border border-line bg-white px-3.5 py-3">
              <p className="font-bold break-words">
                {item.title}
                {item.type === 'group' && <span className="ml-2 text-sm font-normal text-muted">group gift</span>}
              </p>
              <p className="text-[0.92rem] text-muted">{meta}</p>
              <div>
                <button
                  id={`edit-item-${item.id}`} type="button" aria-label={`Edit ${item.title}`} onClick={() => setEditingId(item.id)}
                  className="min-h-11 rounded border border-gray-300 px-4 py-2"
                >
                  Edit
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
