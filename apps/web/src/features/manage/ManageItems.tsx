import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ManageViewResponse } from '@gubbins/shared-types';
import { api, ApiError } from '../../api/client';
import { formatMoney } from '../../lib/formatMoney';
import { manageViewKey } from './manageViewKey';
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
      <h2 id="manage-items-heading" tabIndex={-1} className="text-[0.8rem] font-bold uppercase tracking-[0.06em] text-muted">Items</h2>
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
              <ItemActions slug={slug} item={item} onUnauthorized={onUnauthorized}>
                <button
                  id={`edit-item-${item.id}`} type="button" aria-label={`Edit ${item.title}`} onClick={() => setEditingId(item.id)}
                  className="min-h-11 rounded border border-gray-300 px-4 py-2"
                >
                  Edit
                </button>
              </ItemActions>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface ItemActionsProps {
  slug: string;
  item: ManageViewResponse['items'][number];
  onUnauthorized: () => void;
  /** Edit, shown before Delete. */
  children: ReactNode;
}

/** The item's action row, and Delete's confirmation, reason and error. */
function ItemActions({ slug, item, onUnauthorized, children }: ItemActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const alert = useRef<HTMLParagraphElement>(null);
  const restoreFocus = useRef(false);
  // Focus follows into the confirmation, and back to Delete when the owner keeps the item.
  useEffect(() => {
    if (confirming) keepButton.current?.focus();
    else if (restoreFocus.current) { restoreFocus.current = false; deleteButton.current?.focus(); }
  }, [confirming]);
  const queryClient = useQueryClient();
  const { mutate, error, isPending } = useMutation({
    mutationFn: () => api.deleteItem(slug, item.id),
    // Here rather than on mutate, whose callbacks don't run once the caller has unmounted, as this item does after the refetch.
    // The item leaves the list, so focus goes to the list's heading rather than to nothing.
    onSuccess: () => document.getElementById('manage-items-heading')?.focus(),
    // Returned, so the mutation stays pending until the list has refetched.
    onSettled: () => queryClient.invalidateQueries({ queryKey: manageViewKey(slug) }),
  });
  const hintId = `delete-hint-${item.id}`;
  const alertId = `delete-error-${item.id}`;
  // A refused delete's reason replaces the standing hint, so it shows once.
  const describedBy = error ? alertId : item.deletable ? undefined : hintId;

  function confirmDelete() {
    mutate(undefined, {
      onError: (e) => {
        setConfirming(false);
        if (e instanceof ApiError && e.status === 404) onUnauthorized();
        // The confirmation's buttons are gone, so focus moves to the reason.
        else alert.current?.focus();
      },
    });
  }

  return (
    <>
      <div className="flex gap-3">
        {children}
        <button
          ref={deleteButton} type="button" aria-label={`Delete ${item.title}`} disabled={!item.deletable}
          aria-describedby={describedBy} onClick={() => setConfirming(true)}
          className="min-h-11 rounded border border-wax px-4 py-2 text-wax disabled:opacity-50"
        >
          Delete
        </button>
      </div>
      {!item.deletable && !error && <p id={hintId} className="text-[0.92rem] text-muted">Guests have already picked this one, so it can’t be deleted.</p>}
      {confirming && (
        <div role="group" aria-labelledby={`delete-confirm-${item.id}`} className="grid gap-2.5 rounded-[10px] border-[1.5px] border-wax p-3.5">
          <p id={`delete-confirm-${item.id}`}>Delete “{item.title}”? This can’t be undone.</p>
          <div className="flex gap-3">
            <button type="button" onClick={confirmDelete} disabled={isPending} className="min-h-11 rounded bg-wax px-4 py-2 text-white disabled:opacity-50">
              Delete
            </button>
            <button
              ref={keepButton} type="button" disabled={isPending} onClick={() => { restoreFocus.current = true; setConfirming(false); }}
              className="min-h-11 rounded border border-gray-300 px-4 py-2"
            >
              Keep it
            </button>
          </div>
        </div>
      )}
      <p ref={alert} id={alertId} role="alert" tabIndex={-1} className="text-red-600 empty:hidden">{error?.message}</p>
    </>
  );
}
