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
        <h2 id="list-details-heading" className="text-lg font-semibold">List details</h2>
        <p className="text-xl break-words">{view.title}</p>
        {view.description && <Markdown text={view.description} />}
      </section>
      <section aria-labelledby="guest-key-heading">
        <h2 id="guest-key-heading" className="text-lg font-semibold">Guest key</h2>
        <p className="text-2xl font-bold break-words">{view.key}</p>
      </section>
      <section aria-labelledby="guest-link-heading">
        <h2 id="guest-link-heading" className="text-lg font-semibold">Guest link</h2>
        <p className="text-moss break-words">{window.location.origin + listPath(slug)}</p>
      </section>
    </div>
  );
}
