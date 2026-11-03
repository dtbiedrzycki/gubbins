import { useEffect, useRef, useState } from 'react';
import type { ManageViewResponse } from '@gubbins/shared-types';
import { EditListDetailsForm } from './EditListDetailsForm';
import { Markdown } from '../../lib/Markdown';
import { InvitationCard } from '../../lib/InvitationCard';

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
    <div className="space-y-7">
      <section aria-labelledby="list-details-heading" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          {/* The saved title stays the heading while the form below edits it. */}
          <h2 id="list-details-heading" className="section-heading min-w-0 wrap-anywhere">{view.title}</h2>
          {!editing && (
            <button ref={editButton} type="button" onClick={() => setEditing(true)} className="btn-secondary btn-sm shrink-0">
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
          view.description && <div className="text-muted"><Markdown text={view.description} /></div>
        )}
      </section>
      {/* A grid, not space-y: in block flow the heading's margin collapses into the card's, leaving no room for its string. */}
      <section aria-labelledby="invite-heading" className="grid gap-3">
        <h2 id="invite-heading" className="section-heading">Invite your guests</h2>
        <InvitationCard guestKey={view.key} slug={slug} />
      </section>
    </div>
  );
}
