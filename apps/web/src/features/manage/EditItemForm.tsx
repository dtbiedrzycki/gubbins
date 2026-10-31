import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EditItemRequest, ManageViewResponse } from '@gubbins/shared-types';
import { api, ApiError } from '../../api/client';
import { manageViewKey } from './manageViewKey';
import { parseUsd } from '../../lib/parseUsd';
import { formatMoney } from '../../lib/formatMoney';
import { LimitedInput, LimitedTextarea } from '../../lib/LimitedField';
import { DESCRIPTION_MAX, TITLE_MAX, URL_MAX } from './AddItemForm';

export interface EditItemFormProps {
  slug: string;
  item: ManageViewResponse['items'][number];
  /** The item was saved, or the owner cancelled. */
  onDone: () => void;
  /** The server no longer accepts the owner cookie (404). */
  onUnauthorized: () => void;
}

const field = 'mt-1 block w-full rounded border border-gray-300 px-3 py-2';
const primary = 'min-h-11 rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50';
const secondary = 'min-h-11 rounded border border-gray-300 px-4 py-2';

export function EditItemForm({ slug, item, onDone, onUnauthorized }: EditItemFormProps) {
  const isGroup = item.type === 'group';
  const [title, setTitle] = useState(item.title);
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [price, setPrice] = useState(item.priceMinor === null ? '' : (item.priceMinor / 100).toFixed(2));
  const [url, setUrl] = useState(item.url ?? '');
  const [description, setDescription] = useState(item.description ?? '');
  const [priceError, setPriceError] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<number | null>(null);
  const priceInput = useRef<HTMLInputElement>(null);
  const confirmHeading = useRef<HTMLParagraphElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const focusSubmit = useRef(false);
  // The confirmation replaces the buttons: focus follows into it, and back to Save when dismissed.
  useEffect(() => {
    if (confirmTarget !== null) confirmHeading.current?.focus();
    else if (focusSubmit.current) { focusSubmit.current = false; submitButton.current?.focus(); }
  }, [confirmTarget]);
  const queryClient = useQueryClient();
  const { mutate, error, isPending } = useMutation({
    mutationFn: (input: EditItemRequest) => api.editItem(slug, item.id, input),
    // Returned, so the mutation stays pending until the list has refetched.
    onSettled: () => queryClient.invalidateQueries({ queryKey: manageViewKey(slug) }),
  });

  const newQuantity = Number(quantity);
  // An empty or fractional count is left to the field's own validation.
  const belowCommitted = !isGroup && quantity.trim() !== '' && Number.isInteger(newQuantity) && newQuantity < item.committedUnits;

  function save(priceMinor: number | undefined) {
    const trimmedUrl = url.trim();
    const trimmedDescription = description.trim();
    mutate({
      title: title.trim(),
      quantity: isGroup ? 1 : newQuantity,
      ...(priceMinor !== undefined && { priceMinor }),
      ...(trimmedUrl && { url: trimmedUrl }),
      ...(trimmedDescription && { description: trimmedDescription }),
    }, {
      onSuccess: onDone,
      onError: (e) => { if (e instanceof ApiError && e.status === 404) onUnauthorized(); },
    });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const priceMinor = price.trim() === '' ? undefined : parseUsd(price);
    if (priceMinor === null || (isGroup && priceMinor === undefined)) {
      setPriceError('Enter a price like 25 or 25.50.');
      priceInput.current?.focus();
      return;
    }
    setPriceError('');
    if (isGroup && priceMinor !== undefined && (item.pledgedMinor ?? 0) > 0 && priceMinor <= item.pledgedMinor!) {
      setConfirmTarget(priceMinor);
      return;
    }
    save(priceMinor);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-[0.92rem] text-muted">{isGroup ? 'Group gift · price is required' : 'Single item'}</p>
      <div>
        <label htmlFor="edit-item-title" className="block text-sm font-medium">Title</label>
        <LimitedInput autoFocus id="edit-item-title" required max={TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
      </div>
      {!isGroup && (
        <div>
          <label htmlFor="edit-item-quantity" className="block text-sm font-medium">Quantity</label>
          <input
            id="edit-item-quantity" aria-describedby="edit-item-quantity-warning" type="number" inputMode="numeric" min={1} max={99} required value={quantity}
            onChange={(e) => setQuantity(e.target.value)} className={field}
          />
        </div>
      )}
      <div id="edit-item-quantity-warning" aria-live="polite" className="text-sm text-amber-800 empty:hidden">
        {belowCommitted && `More may already be held or bought than this new quantity. Those stay as they are; guests can’t pick this item again until the count drops below ${newQuantity}.`}
      </div>
      <div>
        <label htmlFor="edit-item-price" className="block text-sm font-medium">{isGroup ? 'Target (USD)' : 'Price (USD)'}</label>
        <input
          ref={priceInput} id="edit-item-price" aria-invalid={!!priceError} aria-describedby={priceError ? 'edit-item-error' : undefined}
          inputMode="decimal" required={isGroup} value={price}
          onChange={(e) => { setPrice(e.target.value); setPriceError(''); setConfirmTarget(null); }} className={field}
        />
      </div>
      <div>
        <label htmlFor="edit-item-url" className="block text-sm font-medium">Store link</label>
        <LimitedInput id="edit-item-url" type="url" max={URL_MAX} value={url} onChange={(e) => setUrl(e.target.value)} className={field} />
      </div>
      <div>
        <label htmlFor="edit-item-description" className="block text-sm font-medium">Description (optional)</label>
        <LimitedTextarea id="edit-item-description" rows={3} max={DESCRIPTION_MAX} value={description} onChange={(e) => setDescription(e.target.value)} className={field} />
      </div>
      <p id="edit-item-error" role="alert" className="text-red-600 empty:mb-0">{priceError || error?.message}</p>
      {confirmTarget !== null ? (
        <div className="space-y-2 rounded-[10px] border border-line p-3">
          <p ref={confirmHeading} tabIndex={-1} className="font-bold">This target is already met</p>
          <p>Guests have chipped in more than {formatMoney(confirmTarget)}. Saving marks the gift as fully funded.</p>
          <div className="flex gap-3">
            <button type="button" disabled={isPending} onClick={() => save(confirmTarget)} className={primary}>
              {isPending ? 'Saving…' : 'Save new target'}
            </button>
            <button type="button" disabled={isPending} onClick={() => { focusSubmit.current = true; setConfirmTarget(null); }} className={secondary}>Go back</button>
          </div>
        </div>
      ) : (
        <div className="flex gap-3">
          <button ref={submitButton} type="submit" disabled={isPending} className={primary}>
            {isPending ? 'Saving…' : belowCommitted ? 'Save anyway' : 'Save'}
          </button>
          <button type="button" onClick={onDone} disabled={isPending} className={secondary}>Cancel</button>
        </div>
      )}
    </form>
  );
}
