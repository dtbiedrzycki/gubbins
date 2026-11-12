import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { HoldView } from '@gubbins/shared-types';
import { useHoldAction, type HoldAction } from './useHoldAction';
import { formatExpiry } from './formatExpiry';
import { PurchaseDialog } from './PurchaseDialog';
import { ApiError } from '../../api/client';
import { actionErrorMessage } from '../../lib/actionErrorMessage';

export interface HoldActionsProps {
  slug: string;
  hold: HoldView;
  itemTitle: string;
  /** An action was started: earlier feedback no longer applies. */
  onStart: () => void;
  onOutcome: (outcome: HoldOutcome) => void;
}

export interface HoldOutcome {
  action: HoldAction;
  ok: boolean;
  message: string;
}

const refusedAs = (error: Error, code: string) => error instanceof ApiError && error.status === 409 && error.code === code;

/** No answer, a failure on our end, a clash with no code, or fewer units free: trying again can work. */
const canRetryPurchase = (error: Error) =>
  !(error instanceof ApiError) || error.status === 0 || error.status >= 500
  || (error.status === 409 && (!error.code || error.code === 'item_unavailable'));

const primary = 'btn-primary';
const secondary = 'btn-secondary';

/**
 * The buttons one hold offers — exactly the server's `actions`, never
 * re-derived here, so the client cannot disagree with the rules it enforces.
 * While any action on the hold is in flight, every button is disabled, so a
 * double tap on slow wifi sends one request. Outcomes go up to the caller,
 * because a refetch can remove this hold, and these buttons with it.
 */
export function HoldActions({ slug, hold, itemTitle, onStart, onOutcome }: HoldActionsProps) {
  const couldnt: Record<HoldAction, string> = {
    extend: `Couldn’t extend your hold on ${itemTitle}.`,
    release: `Couldn’t release your hold on ${itemTitle}.`,
    purchase: `Couldn’t mark ${itemTitle} as purchased.`,
  };
  const failed = (action: HoldAction) => (error: Error) => onOutcome({ action, ok: false, message: actionErrorMessage(error, couldnt[action]) });
  const extended = (view: HoldView) => onOutcome({ action: 'extend', ok: true, message: `Hold extended until ${formatExpiry(view.expiresAt)}.` });
  const released = () => onOutcome({ action: 'release', ok: true, message: `Your hold on ${itemTitle} is released.` });
  // A repeat of an action whose first answer was lost is refused; the refetched hold shows whether it worked.
  const extend = useHoldAction(slug, 'extend', {
    onSuccess: extended,
    onError: (error, refetched) => {
      if (refusedAs(error, 'hold_already_extended') && refetched?.extendedAt) extended(refetched);
      else failed('extend')(error);
    },
  });
  const release = useHoldAction(slug, 'release', {
    onSuccess: released,
    onError: (error, refetched) => {
      if ((refusedAs(error, 'hold_not_active') || (error instanceof ApiError && error.status === 404)) && !refetched) released();
      else failed('release')(error);
    },
  });
  const [purchaseSheetOpen, setPurchaseSheetOpen] = useState(false);
  const purchaseButton = useRef<HTMLButtonElement>(null);
  const purchasedMessage = (purchasedUnits: number | null) =>
    hold.units > 1 ? `${itemTitle}: ${purchasedUnits} marked as purchased. Thank you!` : `${itemTitle} is marked as purchased. Thank you!`;
  const purchase = useHoldAction(slug, 'purchase', {
    onSuccess: (view) => {
      // The modal makes the page inert, so it must be gone before the outcome moves focus.
      flushSync(() => setPurchaseSheetOpen(false));
      onOutcome({ action: 'purchase', ok: true, message: purchasedMessage(view.purchasedUnits) });
    },
    // The sheet, with the typed message, stays for a failure the guest can
    // retry: no answer, our end, a clash, or fewer units free (re-capped by the
    // refetch). Any other, or a refetch that removed the hold and the sheet with
    // it, closes it and goes up.
    onError: (error, refetched) => {
      if (purchaseSheetOpen && refetched && canRetryPurchase(error)) return;
      flushSync(() => setPurchaseSheetOpen(false));
      if (refusedAs(error, 'hold_not_active') && refetched?.status === 'purchased') {
        onOutcome({ action: 'purchase', ok: true, message: purchasedMessage(refetched.purchasedUnits) });
      } else failed('purchase')(error);
    },
  });
  const [confirmingRelease, setConfirmingRelease] = useState(false);
  const releaseButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const releaseQuestion = useRef<HTMLParagraphElement>(null);
  const confirmToggled = useRef(false);

  // The button the guest pressed is replaced, so focus would fall to <body>:
  // move it into the question, and back to Release when they keep the hold.
  useEffect(() => {
    if (!confirmToggled.current) return;
    (confirmingRelease ? keepButton : releaseButton).current?.focus();
  }, [confirmingRelease]);

  function toggleConfirmRelease(next: boolean) {
    confirmToggled.current = true;
    setConfirmingRelease(next);
  }

  // A refetch can leave nothing to buy, which unmounts the sheet: after a
  // refusal, or in the background (say, on returning to the tab). Close it for
  // good, so it cannot reopen on its own, and say why once the page is no longer
  // inert. An object, so the same message twice is still reported twice.
  const [lostPurchase, setLostPurchase] = useState<{ ok: boolean; message: string } | null>(null);
  if (purchaseSheetOpen && !hold.actions.purchase && !purchase.isPending) {
    setPurchaseSheetOpen(false);
    // A request whose answer was lost may still have gone through, or another tab bought it.
    if (hold.status === 'purchased') setLostPurchase({ ok: true, message: purchasedMessage(hold.purchasedUnits) });
    else setLostPurchase({
      ok: false,
      // Only an unavailable refusal explains why the purchase went away; any other kept failure doesn't.
      message: purchase.error && refusedAs(purchase.error, 'item_unavailable')
        ? actionErrorMessage(purchase.error, couldnt.purchase)
        : `You can no longer mark ${itemTitle} as purchased. Reload to see if ${hold.units > 1 ? 'they are' : 'it is'} still available.`,
    });
  }
  const reportLostPurchase = useEffectEvent((outcome: { ok: boolean; message: string }) => {
    onOutcome({ action: 'purchase', ...outcome });
  });
  useEffect(() => {
    if (lostPurchase) reportLostPurchase(lostPurchase);
  }, [lostPurchase]);

  const mutations = [extend, release, purchase];
  const pending = mutations.some((m) => m.isPending);

  const { holdId } = hold;

  function buy(units: number, message: string) {
    onStart();
    purchase.mutate({ holdId, units, message });
  }

  // Unmounting the dialog skips the browser's own focus return, so it is done here.
  function closePurchaseSheet() {
    flushSync(() => setPurchaseSheetOpen(false));
    purchaseButton.current?.focus();
  }

  function openPurchaseSheet() {
    // A sheet starts clean: no stale error from an earlier purchase.
    purchase.reset();
    setPurchaseSheetOpen(true);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {hold.actions.purchase && (
          <button ref={purchaseButton} type="button" disabled={pending} onClick={openPurchaseSheet} className={primary}>Mark as purchased</button>
        )}
        {hold.actions.extend && (
          <button type="button" disabled={pending} onClick={() => { onStart(); extend.mutate({ holdId }); }} className={secondary}>Extend hold</button>
        )}
        {hold.actions.release && !confirmingRelease && (
          <button ref={releaseButton} type="button" disabled={pending} onClick={() => toggleConfirmRelease(true)} className={secondary}>Release hold</button>
        )}
      </div>
      {hold.actions.release && confirmingRelease && (
        <div role="group" aria-labelledby={`release-${hold.holdId}`} className="space-y-2 rounded-[14px] border border-line p-3">
          <p ref={releaseQuestion} id={`release-${hold.holdId}`} tabIndex={-1}>Release your hold on {itemTitle}? Someone else will be able to hold it.</p>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => {
              // The question stays up, its buttons disabled, until the outcome
              // moves focus on; the question is what can hold focus till then.
              releaseQuestion.current?.focus();
              onStart();
              release.mutate({ holdId });
            }} className={primary}>
              Yes, release it
            </button>
            <button ref={keepButton} type="button" disabled={pending} onClick={() => toggleConfirmRelease(false)} className={secondary}>Keep my hold</button>
          </div>
        </div>
      )}
      {purchaseSheetOpen && hold.actions.purchase && (
        <PurchaseDialog
          itemTitle={itemTitle}
          status={hold.status}
          units={hold.units}
          purchasableUnits={hold.purchasableUnits}
          isPending={purchase.isPending}
          error={purchase.error}
          onConfirm={buy}
          onClose={closePurchaseSheet}
        />
      )}
    </div>
  );
}
