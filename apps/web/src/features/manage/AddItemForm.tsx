import type { FormEvent } from 'react';
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AddItemRequest } from '@gubbins/shared-types';
import { api, ApiError } from '../../api/client';
import { manageViewKey } from './manageViewKey';
import { parseUsd } from '../../lib/parseUsd';
import { LimitedInput, LimitedTextarea } from '../../lib/LimitedField';

export interface AddItemFormProps {
  slug: string;
  /** The server no longer accepts the owner cookie (404). */
  onUnauthorized: () => void;
}

const field = 'mt-1 field';

export const TITLE_MAX = 120;
/** The longest store link the API takes. */
export const URL_MAX = 2048;
/** Room for an item's size, colour and store notes; the domain enforces the same cap. */
export const DESCRIPTION_MAX = 1000;

export function AddItemForm({ slug, onUnauthorized }: AddItemFormProps) {
  const [type, setType] = useState<'single' | 'group'>('single');
  const [title, setTitle] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [priceError, setPriceError] = useState('');
  const [added, setAdded] = useState('');
  const priceInput = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { mutate, error, isPending, reset } = useMutation({
    mutationFn: (input: AddItemRequest) => api.addItem(slug, input),
    // Returned, so the mutation stays pending until the list has refetched.
    onSettled: () => queryClient.invalidateQueries({ queryKey: manageViewKey(slug) }),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setAdded('');
    reset();
    const priceMinor = price.trim() === '' ? undefined : parseUsd(price);
    if (priceMinor === null || (type === 'group' && priceMinor === undefined)) {
      setPriceError('Enter a price like 25 or 25.50.');
      priceInput.current?.focus();
      return;
    }
    setPriceError('');
    const trimmedTitle = title.trim();
    const trimmedUrl = url.trim();
    const trimmedDescription = description.trim();
    const common = { title: trimmedTitle, ...(trimmedUrl && { url: trimmedUrl }), ...(trimmedDescription && { description: trimmedDescription }) };
    const body: AddItemRequest = type === 'group'
      ? { type, ...common, priceMinor: priceMinor! }
      : { type, ...common, quantity: Number(quantity), ...(priceMinor !== undefined && { priceMinor }) };
    mutate(body, {
      onSuccess: () => {
        setAdded(`Added "${trimmedTitle}".`);
        setTitle(''); setQuantity('1'); setPrice(''); setUrl(''); setDescription('');
      },
      onError: (e) => { if (e instanceof ApiError && e.status === 404) onUnauthorized(); },
    });
  }

  return (
    <section aria-labelledby="add-item-heading" className="space-y-3">
      <h2 id="add-item-heading" className="section-heading">Add an item</h2>
      <form onSubmit={handleSubmit} className="space-y-4 rounded-[14px] border border-line bg-white p-4">
        <fieldset className="flex gap-4">
          <legend className="font-bold">Kind of item</legend>
          <label className="flex min-h-11 items-center gap-2">
            <input type="radio" name="type" checked={type === 'single'} onChange={() => { setType('single'); setPriceError(''); }} />
            Single item
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input type="radio" name="type" checked={type === 'group'} onChange={() => { setType('group'); setPriceError(''); }} />
            Group gift
          </label>
        </fieldset>
        <div>
          <label htmlFor="item-title" className="block font-bold">Title</label>
          <LimitedInput id="item-title" required max={TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
        </div>
        {type === 'single' && (
          <div>
            <label htmlFor="item-quantity" className="block font-bold">Quantity</label>
            <input
              id="item-quantity" type="number" inputMode="numeric" min={1} max={99} required value={quantity}
              onChange={(e) => setQuantity(e.target.value)} className={field}
            />
          </div>
        )}
        <div>
          <label htmlFor="item-price" className="block font-bold">Price (USD)</label>
          <input
            ref={priceInput} id="item-price" aria-invalid={!!priceError} aria-describedby={priceError ? 'item-error' : undefined} inputMode="decimal" required={type === 'group'} value={price}
            onChange={(e) => { setPrice(e.target.value); setPriceError(''); }} className={field}
          />
        </div>
        <div>
          <label htmlFor="item-url" className="block font-bold">Store link</label>
          <LimitedInput id="item-url" type="url" max={URL_MAX} value={url} onChange={(e) => setUrl(e.target.value)} className={field} />
        </div>
        <div>
          <label htmlFor="item-description" className="block font-bold">Description (optional)</label>
          <LimitedTextarea id="item-description" describedBy={['item-description-hint']} rows={3} max={DESCRIPTION_MAX} value={description} onChange={(e) => setDescription(e.target.value)} className={field} />
          <p id="item-description-hint" className="mt-1 text-sm text-muted">Supports **bold**, *italics*, lists and links.</p>
        </div>
        <p id="item-error" role="alert" className="text-error empty:mb-0">{priceError || error?.message}</p>
        <p role="status" aria-live="polite" className="text-moss empty:mb-0">{added}</p>
        <button type="submit" disabled={isPending} className="btn-primary w-full">
          {isPending ? 'Adding…' : 'Add item'}
        </button>
      </form>
    </section>
  );
}
