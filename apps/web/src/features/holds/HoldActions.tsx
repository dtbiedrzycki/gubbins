import { useEffect, useRef, useState } from 'react';
import type { HoldView } from '@gubbins/shared-types';
import { useHoldAction, type HoldAction } from './useHoldAction';
import { formatExpiry } from './formatExpiry';

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

const primary = 'min-h-11 rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50';
const secondary = 'min-h-11 rounded border px-4 py-2 disabled:opacity-50';

/**
 * The buttons one hold offers — exactly the server's `actions`, never
 * re-derived here, so the client cannot disagree with the rules it enforces.
 * While any action on the hold is in flight, every button is disabled, so a
 * double tap on slow wifi sends one request. Outcomes go up to the caller,
 * because a refetch can remove this hold, and these buttons with it.
 */
export function HoldActions({ slug, hold, itemTitle, onStart, onOutcome }: HoldActionsProps) {
  const failed = (action: HoldAction) => (error: Error) => onOutcome({ action, ok: false, message: error.message });
  const extend = useHoldAction(slug, 'extend', {
    onSuccess: (view) => onOutcome({ action: 'extend', ok: true, message: `Hold extended until ${formatExpiry(view.expiresAt)}.` }),
    onError: failed('extend'),
  });
  const release = useHoldAction(slug, 'release', {
    onSuccess: () => onOutcome({ action: 'release', ok: true, message: `Your hold on ${itemTitle} is released.` }),
    onError: failed('release'),
  });
  const purchase = useHoldAction(slug, 'purchase', {
    onSuccess: () => onOutcome({ action: 'purchase', ok: true, message: `${itemTitle} is marked as purchased. Thank you!` }),
    onError: failed('purchase'),
  });
  const [confirmingRelease, setConfirmingRelease] = useState(false);
  const releaseButton = useRef<HTMLButtonElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
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

  const mutations = [extend, release, purchase];
  const pending = mutations.some((m) => m.isPending);

  function run(mutation: typeof extend) {
    onStart();
    mutation.mutate(hold.holdId);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {hold.actions.purchase && (
          <button type="button" disabled={pending} onClick={() => run(purchase)} className={primary}>Mark as purchased</button>
        )}
        {hold.actions.extend && (
          <button type="button" disabled={pending} onClick={() => run(extend)} className={secondary}>Extend hold</button>
        )}
        {hold.actions.release && !confirmingRelease && (
          <button ref={releaseButton} type="button" disabled={pending} onClick={() => toggleConfirmRelease(true)} className={secondary}>Release hold</button>
        )}
      </div>
      {hold.actions.release && confirmingRelease && (
        <div role="group" aria-labelledby={`release-${hold.holdId}`} className="space-y-2 rounded border border-slate-300 p-3">
          <p id={`release-${hold.holdId}`}>Release your hold on {itemTitle}? Someone else will be able to hold it.</p>
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => { toggleConfirmRelease(false); run(release); }} className={primary}>
              Yes, release it
            </button>
            <button ref={keepButton} type="button" disabled={pending} onClick={() => toggleConfirmRelease(false)} className={secondary}>Keep my hold</button>
          </div>
        </div>
      )}
    </div>
  );
}
