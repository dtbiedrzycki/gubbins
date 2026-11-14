import type { FormEvent } from 'react';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EditListDetailsRequest, ListTheme } from '@gubbins/shared-types';
import { api, ApiError } from '../../api/client';
import { actionErrorMessage } from '../../lib/actionErrorMessage';
import { manageViewKey } from './manageViewKey';
import { LimitedInput, LimitedTextarea } from '../../lib/LimitedField';

export interface EditListDetailsFormProps {
  slug: string;
  title: string;
  description: string;
  theme: ListTheme;
  /** The details were saved, or the owner cancelled. */
  onDone: () => void;
  /** The server no longer accepts the owner cookie (404). */
  onUnauthorized: () => void;
}

const field = 'mt-1 field';

const TITLE_MAX = 120;
/** The same cap as when the list is created. */
const DESCRIPTION_MAX = 2000;

const THEMES: { value: ListTheme; label: string }[] = [{ value: 'storybook', label: 'Storybook' }, { value: 'groovy', label: 'Groovy' }];

export function EditListDetailsForm({ slug, title, description, theme, onDone, onUnauthorized }: EditListDetailsFormProps) {
  const [newTitle, setNewTitle] = useState(title);
  const [newDescription, setNewDescription] = useState(description);
  const [newTheme, setNewTheme] = useState(theme);
  const queryClient = useQueryClient();
  const { mutate, error, isPending } = useMutation({
    mutationFn: (input: EditListDetailsRequest) => api.editListDetails(slug, input),
    // Returned, so the mutation stays pending until the list has refetched.
    onSettled: () => queryClient.invalidateQueries({ queryKey: manageViewKey(slug) }),
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    mutate({ title: newTitle.trim(), description: newDescription.trim() || null, theme: newTheme }, {
      onSuccess: onDone,
      onError: (e) => { if (e instanceof ApiError && e.status === 404) onUnauthorized(); },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="edit-list-title" className="block font-bold">List title</label>
        <LimitedInput autoFocus id="edit-list-title" required max={TITLE_MAX} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className={field} />
      </div>
      <div>
        <label htmlFor="edit-list-description" className="block font-bold">About this list (optional)</label>
        <LimitedTextarea id="edit-list-description" rows={3} max={DESCRIPTION_MAX} value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className={field} />
      </div>
      <fieldset>
        <legend className="font-bold">List style</legend>
        <div className="mt-1 flex gap-6">
          {THEMES.map(({ value, label }) => (
            <label key={value} htmlFor={`edit-list-theme-${value}`} className="flex min-h-11 items-center gap-2">
              <input
                type="radio" id={`edit-list-theme-${value}`} name="edit-list-theme" value={value}
                checked={newTheme === value} onChange={() => setNewTheme(value)} className="size-5 accent-moss"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <p role="alert" className="text-error empty:mb-0">{error && actionErrorMessage(error, 'Couldn’t save the list details.')}</p>
      <div className="flex gap-3">
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onDone} disabled={isPending} className="btn-secondary">Cancel</button>
      </div>
    </form>
  );
}
