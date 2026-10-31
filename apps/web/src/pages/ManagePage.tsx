import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { OwnerTokenGate } from '../features/manage/OwnerTokenGate';
import { AddItemForm } from '../features/manage/AddItemForm';
import { ListDetails } from '../features/manage/ListDetails';
import { ManageItems } from '../features/manage/ManageItems';
import { api, ApiError } from '../api/client';

export default function ManagePage() {
  const { slug } = useParams<{ slug: string }>();
  const [entered, setEntered] = useState(false);
  const [expired, setExpired] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  // The gate's submit button unmounts on success; keep keyboard focus on the page.
  useEffect(() => { if (entered) heading.current?.focus(); }, [entered]);
  const query = useQuery({
    queryKey: ['manage', slug],
    queryFn: () => api.getManageView(slug!),
    enabled: entered && Boolean(slug),
    retry: false,
  });
  const queryClient = useQueryClient();
  const unauthorized = () => {
    // Drop the failed view so entering the token again fetches afresh.
    queryClient.removeQueries({ queryKey: ['manage', slug] });
    setEntered(false);
    setExpired(true);
  };
  // The owner cookie no longer works (404): back to the gate.
  const gone = query.error instanceof ApiError && query.error.status === 404;
  useEffect(() => { if (gone) unauthorized(); }); // eslint-disable-line react-hooks/exhaustive-deps
  if (!slug) return null;

  return (
    <main className="flex-1 bg-paper p-6">
      <div className="max-w-sm space-y-6">
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold">Manage your list</h1>
        {entered ? (
          <>
            {query.data && (
              <>
                <ListDetails slug={slug} view={query.data} />
                <ManageItems slug={slug} items={query.data.items} onUnauthorized={unauthorized} />
              </>
            )}
            {query.error && !gone && <p role="alert" className="text-red-600">{query.error.message}</p>}
            <AddItemForm slug={slug} onUnauthorized={unauthorized} />
          </>
        ) : (
          <OwnerTokenGate
            slug={slug} onSuccess={() => { setEntered(true); setExpired(false); }}
            notice={expired ? 'Enter your owner token again.' : undefined}
          />
        )}
      </div>
    </main>
  );
}
