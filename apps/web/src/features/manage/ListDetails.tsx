import type { ManageViewResponse } from '@gubbins/shared-types';
import { Markdown } from '../../lib/Markdown';
import { listPath } from '../../lib/links';

export interface ListDetailsProps {
  slug: string;
  view: ManageViewResponse;
}

export function ListDetails({ slug, view }: ListDetailsProps) {
  return (
    <div className="space-y-6">
      <section aria-labelledby="list-details-heading" className="space-y-2">
        <h2 id="list-details-heading" className="text-[0.8rem] font-bold uppercase tracking-[0.06em] text-muted">List details</h2>
        <p className="font-display text-[1.25rem] break-words">{view.title}</p>
        {view.description && <Markdown text={view.description} />}
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
