import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useCreateList } from './useCreateList';
import { LimitedInput, LimitedTextarea } from '../../lib/LimitedField';
import { managePath } from '../../lib/links';
import { InvitationCard } from '../../lib/InvitationCard';
import { CopyButton } from '../../lib/CopyButton';

const TITLE_MAX = 120;
/** A Venmo username is at most 30 characters, plus the "@" people often type first. */
const VENMO_MAX = 31;
/** The longest email address there can be; the API caps the handle at the same length. */
const ZELLE_MAX = 254;
/** Room for a greeting, a shipping address and a few links; the domain enforces the same cap. */
const DESCRIPTION_MAX = 2000;

export function CreateListForm() {
  const [listTitle, setListTitle] = useState('');
  const [createSecret, setCreateSecret] = useState('');
  const [venmoHandle, setVenmoHandle] = useState('');
  const [zelleHandle, setZelleHandle] = useState('');
  const [description, setDescription] = useState('');
  const { mutate, data, error, isPending } = useCreateList();
  const suggestion = useQuery({
    queryKey: ['guest-key-suggestion'], queryFn: api.suggestGuestKey,
    staleTime: Infinity, refetchOnWindowFocus: false, retry: false,
  });
  const suggestedKey = suggestion.data?.key;
  const readyHeading = useRef<HTMLHeadingElement>(null);
  // The submit button unmounts on success; keep keyboard focus on the page.
  useEffect(() => { if (data) readyHeading.current?.focus(); }, [data]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!suggestedKey) return;
    const listDescription = description.trim();
    mutate({
      listTitle: listTitle.trim(), key: suggestedKey, createSecret: createSecret.trim(),
      venmoHandle: venmoHandle.trim(), zelleHandle: zelleHandle.trim(),
      ...(listDescription && { listDescription }),
    });
  }

  if (data) {
    return (
      <div className="max-w-sm space-y-7">
        <h1 ref={readyHeading} tabIndex={-1} className="font-display text-[2rem] leading-tight">Your list is ready</h1>
        <InvitationCard guestKey={data.key} slug={data.slug} linked />
        <section aria-labelledby="owner-token-heading" className="grid gap-2.5 rounded-[14px] border-[1.5px] border-wax bg-white p-4">
          <h2 id="owner-token-heading" className="section-heading text-wax">Your owner token</h2>
          <p>Keep this private. You need it to manage the list, and it isn&apos;t shown again.</p>
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            {/* Never rendered inside a link — ADR-062: the owner token must never travel in a URL. */}
            <p id="owner-token" data-testid="owner-token" className="min-w-0 font-mono font-bold wrap-anywhere">{data.ownerToken}</p>
            <CopyButton text={data.ownerToken} label="Copy token" copiedLabel="Token copied" selectTargetId="owner-token" />
          </div>
        </section>
        {/* A new tab, so one tap cannot lose the only display of the owner token and guest key. */}
        <a className="inline-block py-2.5 font-bold text-moss underline" href={managePath(data.slug)} target="_blank" rel="noopener noreferrer">Manage your list <span className="sr-only">(opens in a new tab)</span></a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-sm space-y-5">
      <h1 className="font-display text-[2rem] leading-tight">Create a wishlist</h1>
      <div>
        <label htmlFor="list-title" className="block font-bold">List title</label>
        <LimitedInput
          id="list-title" required max={TITLE_MAX} value={listTitle} onChange={(e) => setListTitle(e.target.value)}
          className="mt-1 field"
        />
      </div>
      <section aria-labelledby="guest-key-heading">
        <h2 id="guest-key-heading" className="section-heading">Guest key</h2>
        <div className="mt-1 flex items-center gap-3">
          <p aria-live="polite" className="grow wrap-anywhere text-2xl font-bold">{suggestedKey}</p>
          <button
            type="button" onClick={() => void suggestion.refetch()}
            className="btn-secondary btn-sm inline-flex items-center gap-1.5"
          >
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 3v6h6" />
            </svg>
            Regenerate
          </button>
        </div>
        <p className="mt-1 text-sm text-muted">Guests type this to open your list. You can’t change it once the list is created.</p>
      </section>
      <div>
        <label htmlFor="list-description" className="block font-bold">About this list (optional)</label>
        <LimitedTextarea
          id="list-description" describedBy={['list-description-hint']} rows={5} max={DESCRIPTION_MAX} value={description} onChange={(e) => setDescription(e.target.value)}
          className="mt-1 field"
        />
        <p id="list-description-hint" className="mt-1 text-sm text-muted">Guests see this above your list. If you want gifts mailed, add your shipping address here. Supports **bold**, *italics*, lists and links.</p>
      </div>
      <div>
        <label htmlFor="create-secret" className="block font-bold">Create secret</label>
        <input
          id="create-secret" type="password" required value={createSecret}
          onChange={(e) => setCreateSecret(e.target.value)}
          className="mt-1 field"
        />
      </div>
      <div>
        <label htmlFor="venmo-handle" className="block font-bold">Venmo username</label>
        <LimitedInput
          id="venmo-handle" describedBy={['handles-hint']} max={VENMO_MAX} value={venmoHandle} onChange={(e) => setVenmoHandle(e.target.value)}
          className="mt-1 field"
        />
      </div>
      <div>
        <label htmlFor="zelle-handle" className="block font-bold">Zelle email or US phone</label>
        <LimitedInput
          id="zelle-handle" describedBy={['handles-hint']} max={ZELLE_MAX} value={zelleHandle} onChange={(e) => setZelleHandle(e.target.value)}
          className="mt-1 field"
        />
      </div>
      <p id="handles-hint" className="text-sm text-muted">Group gifts need at least one handle. Handles can't be changed later.</p>
      <p role="alert" className="text-error empty:mb-0">{error?.message ?? suggestion.error?.message}</p>
      <button
        type="submit" disabled={isPending || !suggestedKey}
        className="btn-primary w-full"
      >
        {isPending ? 'Creating…' : 'Create list'}
      </button>
    </form>
  );
}
