import type { FormEvent } from 'react';
import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AddItemRequest } from '@gubbins/shared-types';
import { api, ApiError } from '../../api/client';
import { parseUsd } from '../../lib/parseUsd';

export interface AddItemFormProps {
  slug: string;
  /** The server no longer accepts the owner cookie (404). */
  onUnauthorized: () => void;
}

const field = 'mt-1 block w-full rounded border border-gray-300 px-3 py-2';

export function AddItemForm({ slug, onUnauthorized }: AddItemFormProps) {
  const [type, setType] = useState<'single' | 'group'>('single');
  const [title, setTitle] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [url, setUrl] = useState('');
  const [priceError, setPriceError] = useState('');
  const [added, setAdded] = useState('');
  const priceInput = useRef<HTMLInputElement>(null);
  const { mutate, error, isPending, reset } = useMutation({
    mutationFn: (input: AddItemRequest) => api.addItem(slug, input),
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
    const common = { title, ...(url.trim() && { url: url.trim() }) };
    const body: AddItemRequest = type === 'group'
      ? { type, ...common, priceMinor: priceMinor! }
      : { type, ...common, quantity: Number(quantity), ...(priceMinor !== undefined && { priceMinor }) };
    mutate(body, {
      onSuccess: () => {
        setAdded(`Added "${title.trim()}".`);
        setTitle(''); setQuantity('1'); setPrice(''); setUrl('');
      },
      onError: (e) => { if (e instanceof ApiError && e.status === 404) onUnauthorized(); },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-4">
      <fieldset className="flex gap-4">
        <legend className="text-sm font-medium">Kind of item</legend>
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
        <label htmlFor="item-title" className="block text-sm font-medium">Title</label>
        <input id="item-title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
      </div>
      {type === 'single' && (
        <div>
          <label htmlFor="item-quantity" className="block text-sm font-medium">Quantity</label>
          <input
            id="item-quantity" type="number" inputMode="numeric" min={1} max={99} required value={quantity}
            onChange={(e) => setQuantity(e.target.value)} className={field}
          />
        </div>
      )}
      <div>
        <label htmlFor="item-price" className="block text-sm font-medium">Price (USD)</label>
        <input
          ref={priceInput} id="item-price" aria-invalid={!!priceError} aria-describedby={priceError ? 'item-error' : undefined} inputMode="decimal" required={type === 'group'} value={price}
          onChange={(e) => { setPrice(e.target.value); setPriceError(''); }} className={field}
        />
      </div>
      <div>
        <label htmlFor="item-url" className="block text-sm font-medium">Store link</label>
        <input id="item-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} className={field} />
      </div>
      <p id="item-error" role="alert" className="text-red-600 empty:mb-0">{priceError || error?.message}</p>
      <p role="status" aria-live="polite" className="text-green-800 empty:mb-0">{added}</p>
      <button type="submit" disabled={isPending} className="min-h-11 rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
        {isPending ? 'Adding…' : 'Add item'}
      </button>
    </form>
  );
}
