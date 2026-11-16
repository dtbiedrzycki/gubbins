import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { HoldView } from '@gubbins/shared-types';
import { useHoldAction, type HoldAction } from './useHoldAction';
import { formatExpiry } from './formatExpiry';
import { PurchaseDialog } from './PurchaseDialog';
import { purchasedMessage } from './purchasedMessage';
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

/** The actions that ask a question before they act. */
type AskFirst = Extract<HoldAction, 'release' | 'undoBuy'>;

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
    undoBuy: `Couldn’t undo buying ${itemTitle}.`,
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
  const purchase = useHoldAction(slug, 'purchase', {
    onSuccess: (view) => {
      // The modal makes the page inert, so it must be gone before the outcome moves focus.
      flushSync(() => setPurchaseSheetOpen(false));
      onOutcome({ action: 'purchase', ok: true, message: purchasedMessage(itemTitle, hold.units, view.purchasedUnits) });
    },
    // The sheet, with the typed message, stays for a failure the guest can
    // retry: no answer, our end, a clash, or fewer units free (re-capped by the
    // refetch). Any other, or a refetch that removed the hold and the sheet with
    // it, closes it and goes up.
    onError: (error, refetched) => {
      if (purchaseSheetOpen && refetched && canRetryPurchase(error)) return;
      flushSync(() => setPurchaseSheetOpen(false));
      if (refusedAs(error, 'hold_not_active') && refetched?.status === 'purchased') {
        onOutcome({ action: 'purchase', ok: true, message: purchasedMessage(itemTitle, hold.units, refetched.purchasedUnits) });
      } else failed('purchase')(error);
    },
  });
  // A repeated undo answers 200, so it needs no refusal special case.
  const undoBuy = useHoldAction(slug, 'undoBuy', {
    onSuccess: () => onOutcome({ action: 'undoBuy', ok: true, message: `${itemTitle} is available to other guests again.` }),
    onError: failed('undoBuy'),
  });

  const { holdId } = hold;
  // The actions that ask first: their question, their answers, and what yes sends.
  const questions = {
    release: {
      text: `Release your hold on ${itemTitle}? Someone else will be able to hold it.`,
      yes: 'Yes, release it', keep: 'Keep my hold',
      send: () => release.mutate({ holdId }),
    },
    undoBuy: {
      // Only a bought hold offers the undo, and it always carries purchasedUnits; the type is nullable for the others.
      text: `Undo buying ${itemTitle}? Other guests will be able to buy ${(hold.purchasedUnits ?? 1) > 1 ? 'them' : 'it'}.`,
      yes: 'Yes, undo it', keep: 'Keep it',
      send: () => undoBuy.mutate({ holdId }),
    },
  };
  const [confirming, setConfirming] = useState<AskFirst | null>(null);
  const releaseButton = useRef<HTMLButtonElement>(null);
  const undoBuyButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const questionText = useRef<HTMLParagraphElement>(null);
  // The action whose question last opened; null until then, so mounting moves no focus.
  const asked = useRef<AskFirst | null>(null);

  // The button the guest pressed is replaced, so focus would fall to <body>:
  // move it into the question, and back to the asking button when they keep it.
  // An effect event, so only the question opening or closing moves focus, not every render.
  // The asking buttons' refs stay out of questions: the compiler lint refuses refs in an object render reads.
  const moveFocus = useEffectEvent((open: AskFirst | null) => {
    if (asked.current) (open ? keepButton : { release: releaseButton, undoBuy: undoBuyButton }[asked.current]).current?.focus();
  });
  useEffect(() => moveFocus(confirming), [confirming]);

  function ask(action: AskFirst) {
    asked.current = action;
    setConfirming(action);
  }

  // A refetch can leave nothing to buy, which unmounts the sheet: after a
  // refusal, or in the background (say, on returning to the tab). Close it for
  // good, so it cannot reopen on its own, and say why once the page is no longer
  // inert. An object, so the same message twice is still reported twice.
  const [lostPurchase, setLostPurchase] = useState<{ ok: boolean; message: string } | null>(null);
  if (purchaseSheetOpen && !hold.actions.purchase && !purchase.isPending) {
    setPurchaseSheetOpen(false);
    // A request whose answer was lost may still have gone through, or another tab bought it.
    if (hold.status === 'purchased') setLostPurchase({ ok: true, message: purchasedMessage(itemTitle, hold.units, hold.purchasedUnits) });
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

  const mutations = [extend, release, purchase, undoBuy];
  const pending = mutations.some((m) => m.isPending);

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
        {hold.actions.release && confirming !== 'release' && (
          <button ref={releaseButton} type="button" disabled={pending} onClick={() => ask('release')} className={secondary}>Release hold</button>
        )}
        {hold.actions.undoBuy && confirming !== 'undoBuy' && (
          <button ref={undoBuyButton} type="button" disabled={pending} onClick={() => ask('undoBuy')} className={secondary}>I didn’t buy it</button>
        )}
      </div>
      {confirming && hold.actions[confirming] && (
        <div role="group" aria-labelledby={`${confirming}-${holdId}`} className="space-y-2 rounded-[14px] border border-line p-3">
          <p ref={questionText} id={`${confirming}-${holdId}`} tabIndex={-1}>{questions[confirming].text}</p>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => {
              // The question stays up, its buttons disabled, until the outcome
              // moves focus on; the question is what can hold focus till then.
              questionText.current?.focus();
              onStart();
              questions[confirming].send();
            }} className={primary}>
              {questions[confirming].yes}
            </button>
            <button ref={keepButton} type="button" disabled={pending} onClick={() => setConfirming(null)} className={secondary}>{questions[confirming].keep}</button>
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
