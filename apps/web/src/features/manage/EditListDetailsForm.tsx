import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EditListDetailsRequest } from '@gubbins/shared-types';
import { api, ApiError } from '../../api/client';
import { manageViewKey } from './manageViewKey';
import { LimitedInput, LimitedTextarea } from '../../lib/LimitedField';

export interface EditListDetailsFormProps {
  slug: string;
  title: string;
  description: string;
  /** The details were saved, or the owner cancelled. */
  onDone: () => void;
  /** The server no longer accepts the owner cookie (404). */
  onUnauthorized: () => void;
}

const field = 'mt-1 block w-full rounded border border-gray-300 px-3 py-2';

const TITLE_MAX = 120;
/** The same cap as when the list is created. */
const DESCRIPTION_MAX = 2000;

export function EditListDetailsForm({ slug, title, description, onDone, onUnauthorized }: EditListDetailsFormProps) {
  const [newTitle, setNewTitle] = useState(title);
  const [newDescription, setNewDescription] = useState(description);
  const queryClient = useQueryClient();
  const { mutate, error, isPending } = useMutation({
    mutationFn: (input: EditListDetailsRequest) => api.editListDetails(slug, input),
    // Returned, so the mutation stays pending until the list has refetched.
    onSettled: () => queryClient.invalidateQueries({ queryKey: manageViewKey(slug) }),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedDescription = newDescription.trim();
    mutate({ title: newTitle.trim(), ...(trimmedDescription && { description: trimmedDescription }) }, {
      onSuccess: onDone,
      onError: (e) => { if (e instanceof ApiError && e.status === 404) onUnauthorized(); },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="edit-list-title" className="block text-sm font-medium">List title</label>
        <LimitedInput autoFocus id="edit-list-title" required max={TITLE_MAX} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className={field} />
      </div>
      <div>
        <label htmlFor="edit-list-description" className="block text-sm font-medium">About this list (optional)</label>
        <LimitedTextarea id="edit-list-description" rows={5} max={DESCRIPTION_MAX} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className={field} />
      </div>
      <p role="alert" className="text-red-600 empty:mb-0">{error?.message}</p>
      <div className="flex gap-3">
        <button type="submit" disabled={isPending} className="min-h-11 rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onDone} disabled={isPending} className="min-h-11 rounded border border-gray-300 px-4 py-2">Cancel</button>
      </div>
    </form>
  );
}
