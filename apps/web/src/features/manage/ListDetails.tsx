import { useEffect, useRef, useState } from 'react';
import type { ManageViewResponse } from '@gubbins/shared-types';
import { EditListDetailsForm } from './EditListDetailsForm';
import { Markdown } from '../../lib/Markdown';
import { listPath } from '../../lib/links';

export interface ListDetailsProps {
  slug: string;
  view: ManageViewResponse;
  /** The server no longer accepts the owner cookie (404). */
  onUnauthorized: () => void;
}

export function ListDetails({ slug, view, onUnauthorized }: ListDetailsProps) {
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  // The Edit button is unmounted while the form shows, so focus returns to it once it is back.
  useEffect(() => {
    if (!editing && restoreFocus.current) { restoreFocus.current = false; editButton.current?.focus(); }
  }, [editing]);

  return (
    <div className="space-y-6">
      <section aria-labelledby="list-details-heading" className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 id="list-details-heading" className="text-[0.8rem] font-bold uppercase tracking-[0.06em] text-muted">List details</h2>
          {!editing && (
            <button
              ref={editButton} type="button" onClick={() => setEditing(true)}
              className="min-h-11 rounded border border-gray-300 px-4 py-2"
            >
              Edit
            </button>
          )}
        </div>
        {editing ? (
          <EditListDetailsForm
            slug={slug} title={view.title} description={view.description ?? ''} onUnauthorized={onUnauthorized}
            onDone={() => { restoreFocus.current = true; setEditing(false); }}
          />
        ) : (
          <>
            <p className="font-display text-[1.25rem] break-words">{view.title}</p>
            {view.description && <Markdown text={view.description} />}
          </>
        )}
      </section>
      <section aria-labelledby="guest-key-heading" className="space-y-1">
        <h2 id="guest-key-heading" className="text-[0.8rem] font-bold uppercase tracking-[0.06em] text-muted">Guest key</h2>
        <p className="text-2xl font-bold break-words">{view.key}</p>
      </section>
      <section aria-labelledby="guest-link-heading" className="space-y-1">
        <h2 id="guest-link-heading" className="text-[0.8rem] font-bold uppercase tracking-[0.06em] text-muted">Guest link</h2>
        <p className="text-moss break-words">{window.location.origin + listPath(slug)}</p>
      </section>
    </div>
  );
}
