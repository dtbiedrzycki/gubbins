import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { OwnerTokenGate } from '../features/manage/OwnerTokenGate';
import { AddItemForm } from '../features/manage/AddItemForm';
import { giftDetailsKey, manageViewKey } from '../features/manage/manageViewKey';
import { ListDetails } from '../features/manage/ListDetails';
import { ManageItems } from '../features/manage/ManageItems';
import { WhoGaveWhat } from '../features/manage/WhoGaveWhat';
import { useListTheme } from '../lib/useListTheme';
import { api, ApiError } from '../api/client';

export default function ManagePage() {
  const { slug } = useParams<{ slug: string }>();
  const [entered, setEntered] = useState(false);
  // Which 404 sent the owner back: a gift's own action (it may just be gone) or anything else (the session).
  const [expired, setExpired] = useState<'gift' | 'session' | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // The gate's submit button unmounts on success; keep keyboard focus on the page.
  useEffect(() => { if (entered) heading.current?.focus(); }, [entered]);
  const query = useQuery({
    queryKey: manageViewKey(slug!),
    queryFn: () => api.getManageView(slug!),
    enabled: entered && Boolean(slug),
    retry: false,
  });
  const queryClient = useQueryClient();
  // The owner cookie no longer works (404): back to the gate.
  const viewGone = query.error instanceof ApiError && query.error.status === 404;
  // Who gave what: fetched only once the owner asks, and never remembered across a reload (ADR-0089).
  const [revealed, setRevealed] = useState(false);
  const details = useQuery({
    queryKey: giftDetailsKey(slug!),
    queryFn: () => api.getGiftDetails(slug!),
    enabled: entered && revealed && !viewGone && Boolean(slug),
    retry: false,
  });
  const detailsGone = details.error instanceof ApiError && details.error.status === 404;
  // Either 404 means the owner cookie no longer works: back to the gate.
  const gone = viewGone || detailsGone;
  // The token screen keeps the default look, even with an earlier view still cached.
  useListTheme(entered && !gone ? query.data?.theme : undefined);
  const unauthorized = () => { setEntered(false); setExpired('session'); };
  const giftUnauthorized = () => { setEntered(false); setExpired('gift'); };
  if (!slug) return null;

  return (
    <main className="flex-1 bg-paper p-6">
      <div className="mx-auto max-w-sm space-y-7">
        <h1 ref={heading} tabIndex={-1} className="font-display text-[2rem] leading-tight">Manage your list</h1>
        {entered && !gone ? (
          <>
            {/* At the top, so a failed refresh isn't hidden below a long list. */}
            {query.error && <p role="alert" className="text-error">{query.error.message}</p>}
            {query.data && <ListDetails slug={slug} onUnauthorized={unauthorized} view={query.data} />}
            {/* Above the items, so adding never means scrolling past a long list. */}
            <AddItemForm slug={slug} onUnauthorized={unauthorized} />
            {query.data && (
              <WhoGaveWhat
                revealed={revealed && details.isSuccess} loading={details.isLoading} error={detailsGone ? null : details.error}
                onShow={() => { setRevealed(true); if (details.isError) void details.refetch(); }}
                onHide={() => { setRevealed(false); queryClient.removeQueries({ queryKey: giftDetailsKey(slug) }); }}
              />
            )}
            {query.data && <ManageItems slug={slug} items={query.data.items} onUnauthorized={giftUnauthorized} details={revealed ? details.data?.items : undefined} />}
          </>
        ) : (
          <OwnerTokenGate
            slug={slug}
            onSuccess={() => {
              // Drop a failed view so the new session fetches afresh.
              queryClient.removeQueries({ queryKey: manageViewKey(slug) });
              // However the owner got back here, a new session starts with who gave what hidden.
              setEntered(true); setExpired(null); setRevealed(false);
            }}
            notice={expired === 'gift'
              ? 'That gift may have been deleted on another device, or your owner session has ended. Enter your owner token to keep managing your list.'
              : expired || gone ? 'Your owner session has ended. Enter your owner token to keep managing your list.' : undefined}
          />
        )}
      </div>
    </main>
  );
}
