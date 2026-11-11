import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ManageViewResponse } from '@gubbins/shared-types';
import { api, ApiError, type MoveTarget } from '../../api/client';
import { formatMoney } from '../../lib/formatMoney';
import { actionErrorMessage } from './actionErrorMessage';
import { manageViewKey } from './manageViewKey';
import { EditItemForm } from './EditItemForm';
import { MoveItemButtons } from './MoveItemButtons';

export interface ManageItemsProps {
  slug: string;
  /** The manage-view query's items as cached; a move waits for this array to be the refetched one. */
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

  const queryClient = useQueryClient();
  const lastMove = useRef<{ itemId: string; to: MoveTarget } | null>(null);
  // Written directly rather than through state: the text is worked out in an effect, once the moved list has rendered.
  const announcement = useRef<HTMLParagraphElement>(null);
  const [moveErrors, setMoveErrors] = useState<Record<string, string>>({});
  const focusErrorOf = useRef<string | null>(null);
  const move = useMutation({
    mutationFn: ({ itemId, to }: { itemId: string; to: MoveTarget }) => api.moveItem(slug, itemId, to),
    onMutate: ({ itemId }) => {
      announcement.current!.textContent = '';
      // Only this gift's error clears; another gift's error stays until that gift moves.
      setMoveErrors((errors) => {
        if (!(itemId in errors)) return errors;
        const rest = { ...errors };
        delete rest[itemId];
        return rest;
      });
    },
    onSuccess: (_, moved) => { lastMove.current = moved; },
    onError: (e, { itemId }) => {
      if (e instanceof ApiError && e.status === 404) onUnauthorized();
      focusErrorOf.current = itemId;
      setMoveErrors((errors) => ({ ...errors, [itemId]: actionErrorMessage(e, 'move', items.find((i) => i.id === itemId)?.title ?? 'this gift') }));
    },
    // Returned, so the mutation stays pending until the list has refetched.
    onSettled: () => queryClient.invalidateQueries({ queryKey: manageViewKey(slug) }),
  });
  // Keyed on isPending too: a refetch with an unchanged list hands back the same items.
  // isPending can clear a render before the refetched items arrive, so it also waits for the items to match the cache.
  // Reordering keyed rows moves DOM nodes, which can drop focus, so it is put back on the moved gift's block.
  useEffect(() => {
    const moved = lastMove.current;
    if (move.isPending || !moved || items !== queryClient.getQueryData<ManageViewResponse>(manageViewKey(slug))?.items) return;
    lastMove.current = null;
    const index = items.findIndex((i) => i.id === moved.itemId);
    if (index < 0) return;
    const button = document.getElementById(`move-${moved.to}-${moved.itemId}`) as HTMLButtonElement | null;
    (button?.disabled ? button.parentElement?.querySelector<HTMLButtonElement>('button:enabled') : button)?.focus();
    announcement.current!.textContent = `${items[index]!.title} moved to position ${index + 1} of ${items.length}.`;
  }, [items, move.isPending, queryClient, slug]);
  useEffect(() => {
    if (!focusErrorOf.current) return;
    document.getElementById(`move-error-${focusErrorOf.current}`)?.focus();
    focusErrorOf.current = null;
  }, [moveErrors]);

  return (
    <section aria-labelledby="manage-items-heading" className="space-y-3">
      <h2 id="manage-items-heading" tabIndex={-1} className="section-heading">Items</h2>
      <ul role="list">
        {items.map((item, index) => {
          // A group gift always has a price; the type is nullable only because singles may lack one.
          const meta = item.type === 'group'
            ? `${formatMoney(item.priceMinor ?? 0)} target`
            : [item.priceMinor === null ? null : formatMoney(item.priceMinor), `quantity ${item.quantity}`].filter(Boolean).join(' · ');
          if (item.id === editingId) {
            return (
              <li key={item.id} className="grid gap-3 border-b border-line py-3.5 first:border-t">
                <h3 className="section-heading">Edit item</h3>
                <EditItemForm
                  slug={slug} item={item} onUnauthorized={onUnauthorized}
                  onDone={() => { restoreFocusTo.current = item.id; setEditingId(null); }}
                />
              </li>
            );
          }
          return (
            <li key={item.id} className="grid grid-cols-[1fr_auto] items-start gap-2.5 border-b border-line py-3.5 first:border-t">
              <div className="grid min-w-0 gap-1">
                <p className="font-bold break-words">
                  {item.title}
                  {item.type === 'group' && <span className="ml-2 text-sm font-normal text-muted">group gift</span>}
                </p>
                <p className="text-[0.92rem] text-muted">{meta}</p>
                <ItemActions slug={slug} item={item} onUnauthorized={onUnauthorized}>
                  <button
                    id={`edit-item-${item.id}`} type="button" aria-label={`Edit ${item.title}`} onClick={() => setEditingId(item.id)}
                    className="btn-secondary btn-sm"
                  >
                    Edit
                  </button>
                </ItemActions>
                {moveErrors[item.id] && (
                  <p id={`move-error-${item.id}`} role="alert" tabIndex={-1} className="text-error">{moveErrors[item.id]}</p>
                )}
              </div>
              <MoveItemButtons
                title={item.title} itemId={item.id} index={index} count={items.length} pending={move.isPending}
                onMove={(to) => move.mutate({ itemId: item.id, to })}
              />
            </li>
          );
        })}
      </ul>
      <p ref={announcement} id="move-announcement" aria-live="polite" className="sr-only" />
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
    // On the hook rather than on mutate: mutate's callbacks are skipped if the item has already unmounted.
    // The item leaves the list, so focus goes to the list's heading rather than to nothing.
    onSuccess: () => document.getElementById('manage-items-heading')?.focus(),
    // Returned, so the mutation stays pending until the list has refetched.
    onSettled: () => queryClient.invalidateQueries({ queryKey: manageViewKey(slug) }),
  });
  // The confirmation's buttons are gone, so focus moves to the reason once it has rendered (the alert hides while empty).
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  const hintId = `delete-hint-${item.id}`;
  const alertId = `delete-error-${item.id}`;
  // A refused delete's reason replaces the standing hint, so it shows once.
  const describedBy = error ? alertId : item.deletable ? undefined : hintId;

  function confirmDelete() {
    mutate(undefined, {
      onError: (e) => {
        setConfirming(false);
        if (e instanceof ApiError && e.status === 404) onUnauthorized();
      },
    });
  }

  return (
    <>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {children}
        <button
          ref={deleteButton} type="button" aria-label={`Delete ${item.title}`} disabled={!item.deletable}
          aria-describedby={describedBy} onClick={() => setConfirming(true)}
          className="btn-danger btn-sm"
        >
          Delete
        </button>
        {!item.deletable && !error && <p id={hintId} className="text-[0.92rem] text-muted">Guests have already picked this one, so it can’t be deleted.</p>}
      </div>
      {confirming && (
        <div role="group" aria-labelledby={`delete-confirm-${item.id}`} className="grid gap-2.5 rounded-[14px] border-[1.5px] border-wax bg-white p-3.5">
          <p id={`delete-confirm-${item.id}`}>Delete “{item.title}”? This can’t be undone.</p>
          <div className="flex gap-3">
            <button type="button" onClick={confirmDelete} disabled={isPending} className="btn-delete btn-sm">
              Delete
            </button>
            <button
              ref={keepButton} type="button" disabled={isPending} onClick={() => { restoreFocus.current = true; setConfirming(false); }}
              className="btn-secondary btn-sm"
            >
              Keep it
            </button>
          </div>
        </div>
      )}
      <p ref={alert} id={alertId} role="alert" tabIndex={-1} className="text-error empty:hidden">{error && actionErrorMessage(error, 'delete', item.title)}</p>
    </>
  );
}
