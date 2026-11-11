import { useEffect, useEffectEvent, useRef, useState, type ReactNode, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { useIsMutating } from '@tanstack/react-query';
import type { HoldView, ListViewResponse } from '@gubbins/shared-types';
import { HoldActions, type HoldOutcome } from './HoldActions';
import { formatExpiry } from './formatExpiry';
import { Seal } from './Seal';
import { formatMoney } from '../../lib/formatMoney';
import { useModalDialog } from '../../lib/useModalDialog';

export interface YourContributionsProps {
  slug: string;
  holds: HoldView[];
  contributions: ListViewResponse['myContributions'];
  itemTitles: Record<string, string>;
  /** An action removed the last entry, so the sheet and its button are gone. */
  onEmptied: () => void;
}

function statusLine(hold: HoldView): string {
  switch (hold.status) {
    case 'active':
      return `Held until ${formatExpiry(hold.expiresAt)}${hold.extendedAt ? ' (extended)' : ''}.`;
    case 'expired':
      return hold.actions.purchase
        ? `Your hold expired on ${formatExpiry(hold.expiresAt)}. You can still mark it as purchased.`
        : `Your hold expired on ${formatExpiry(hold.expiresAt)}.`;
    case 'purchased':
      return 'Marked as purchased.';
    case 'released':
      return 'Released.';
  }
}

/**
 * "Your contributions": a floating button, once this session has a hold or a
 * pledge, that opens a sheet listing them; holds with their expiry and the
 * actions they offer, pledges read-only. Outcomes show in the sheet, not on
 * the hold's card: the refetch after an action can remove the card (a
 * release, or a hold already released in another tab). An outcome that
 * empties the sheet closes it and shows in this component's own page-level
 * pair instead. Every live region stays mounted while its container is
 * (ADR-0025). Feedback clears when the next action starts, so a repeated
 * message is announced again. A "released" message also clears when a new
 * hold appears, which it would contradict; other messages stay to be read.
 */
export function YourContributions({ slug, holds, contributions, itemTitles, onEmptied }: YourContributionsProps) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<HoldOutcome | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const sheetHeading = useRef<HTMLHeadingElement>(null);
  const cardHeadings = useRef(new Map<string, HTMLHeadingElement>());
  const holdIds = holds.map((hold) => hold.holdId);
  const [knownHoldIds, setKnownHoldIds] = useState(holdIds);
  // Only a hold that appears while the page is open gets its seal stamped in.
  const [initialHoldIds] = useState(() => new Set(holdIds));
  if (holdIds.some((id) => !knownHoldIds.includes(id))) {
    setKnownHoldIds(holdIds);
    if (outcome?.ok && outcome.action === 'release') setOutcome(null);
  }

  const entries = holds.length + contributions.length;
  // The button's seal stamps in the first time it appears while the page is open, never again.
  const [stampButton, setStampButton] = useState(entries === 0);
  const [shown, setShown] = useState(entries > 0);
  if (shown !== entries > 0) {
    setShown(entries > 0);
    if (shown) setStampButton(false);
  }
  const [emptied, setEmptied] = useState(false);
  if (open && entries === 0) {
    setOpen(false);
    setEmptied(true);
  }
  // After the dialog has gone, so the page is no longer inert.
  const reportEmptied = useEffectEvent(onEmptied);
  useEffect(() => {
    if (emptied) reportEmptied();
  }, [emptied]);

  function openSheet() {
    setOutcome(null);
    setEmptied(false);
    setOpen(true);
  }

  // Unmounting the dialog skips the browser's own focus return, so it is done here.
  function closeSheet() {
    flushSync(() => { setOpen(false); setOutcome(null); });
    button.current?.focus();
  }

  // The pressed button is disabled in flight and often gone after, so focus
  // moves to something that outlives the refetch: the hold's own heading if
  // its card stays, otherwise the sheet's heading beside the feedback.
  function showOutcome(holdId: string, next: HoldOutcome) {
    setOutcome(next);
    const card = next.ok && next.action !== 'release' ? cardHeadings.current.get(holdId) : undefined;
    (card ?? sheetHeading.current)?.focus();
  }

  const status = outcome?.ok ? outcome.message : '';
  const alert = outcome && !outcome.ok ? outcome.message : '';
  // The sheet shows an outcome once its refetch has landed: if that empties
  // the sheet, the page pair announces it instead, and only once.
  const settling = useIsMutating() > 0;

  return (
    <>
      <p role="status" aria-live="polite" className="mt-3 font-bold text-moss empty:mt-0">{open ? '' : status}</p>
      <p role="alert" className="mt-3 text-error empty:mt-0">{open ? '' : alert}</p>
      {entries > 0 && (
        <>
          {/* Gifts scrolling under the button fade out behind it. */}
          <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-0 z-10 h-[70px] bg-linear-to-b from-transparent to-paper" />
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-10 flex justify-center px-4">
            <button ref={button} type="button" onClick={openSheet} className="btn-primary pointer-events-auto inline-flex items-center gap-2 whitespace-nowrap shadow-[0_4px_14px_rgb(0_0_0/0.25)]">
              <Seal size="sm" stamp={stampButton} />
              {/* Past two digits the pill would outgrow a phone's width. */}
              Your contributions · {entries > 99 ? '99+' : entries}
            </button>
          </div>
        </>
      )}
      {open && (
        <Sheet headingRef={sheetHeading} onClose={closeSheet}>
          <div>
            <p role="status" aria-live="polite" className="font-bold text-moss">{settling ? '' : status}</p>
            <p role="alert" className="text-error">{settling ? '' : alert}</p>
          </div>
          <ul className="space-y-3">
            {holds.map((hold) => {
              const itemTitle = itemTitles[hold.itemId] ?? 'This item';
              // A purchased hold counts what was bought; the rest were released.
              const count = hold.status === 'purchased' ? hold.purchasedUnits : hold.units;
              return (
                <li key={hold.holdId} className="space-y-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
                  <div className="flex items-center gap-2.5">
                    {(hold.status === 'active' || hold.status === 'purchased') && <Seal tone={hold.status === 'purchased' ? 'gold-wax' : 'red-wax'} stamp={!initialHoldIds.has(hold.holdId)} />}
                    <h3
                      ref={(el) => {
                        if (el) cardHeadings.current.set(hold.holdId, el);
                        return () => { cardHeadings.current.delete(hold.holdId); };
                      }}
                      tabIndex={-1}
                      className="min-w-0 font-bold"
                    >
                      {itemTitle}
                    </h3>
                    {count !== null && count > 1 && <span className="shrink-0 font-bold text-moss">× {count}</span>}
                  </div>
                  <p>{statusLine(hold)}</p>
                  <HoldActions slug={slug} hold={hold} itemTitle={itemTitle} onStart={() => setOutcome(null)} onOutcome={(next) => showOutcome(hold.holdId, next)} />
                </li>
              );
            })}
            {contributions.map((pledge) => (
              <li key={pledge.contributionId} className="space-y-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-center gap-2.5">
                  <Seal tone="coin" />
                  <h3 className="min-w-0 font-bold">{itemTitles[pledge.itemId] ?? 'This item'}</h3>
                </div>
                <p>You chipped in {formatMoney(pledge.amountMinor)}.</p>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}

/**
 * The modal sheet (ADR-0024), mounted only while open, and kept open while a
 * hold action is in flight. On a phone it rises from the bottom.
 */
function Sheet({ headingRef, onClose, children }: { headingRef: RefObject<HTMLHeadingElement | null>; onClose: () => void; children: ReactNode }) {
  // While the sheet is open the page is inert, so any mutation is one of its hold actions.
  const isPending = useIsMutating() > 0;
  const { ref, onCancel, onClose: handleClose } = useModalDialog({ isPending, onClose });
  return (
    <dialog
      ref={ref}
      aria-labelledby="your-contributions-heading"
      // The purchase sheet opens inside this one, and React passes its cancel
      // and close events up to this dialog too: act only on this dialog's own.
      onCancel={(event) => { if (event.target === event.currentTarget) onCancel(event); }}
      onClose={(event) => { if (event.target === event.currentTarget) handleClose(); }}
      // A click on the dialog element itself, outside its padded content, is on the backdrop.
      onClick={(event) => { if (event.target === event.currentTarget && !isPending) onClose(); }}
      className="mt-auto mb-0 w-full max-w-none rounded-t-[22px] bg-paper p-0 text-ink backdrop:bg-ink/50 sm:m-auto sm:w-[calc(100%-2rem)] sm:max-w-sm sm:rounded-[22px]"
    >
      <div className="space-y-3 break-words p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 ref={headingRef} id="your-contributions-heading" tabIndex={-1} className="font-display text-[1.4rem] leading-tight">Your contributions</h2>
          <button type="button" onClick={onClose} disabled={isPending} className="btn-secondary">Close</button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
