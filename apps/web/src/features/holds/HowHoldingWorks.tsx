import { useState } from 'react';

const DISMISSED_KEY = 'gubbins.holdingExplainerDismissed';

/** Blocked or empty storage reads as not dismissed, so the card shows. */
function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'yes';
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, 'yes');
  } catch {
    // Not remembered: the card shows again next visit.
  }
}

/**
 * Shows on every visit until the guest dismisses it on this device.
 * Every hold can be extended exactly once (ADR-0002), so that clause always shows.
 */
export function HowHoldingWorks({ holdDurationDays, onDismiss }: {
  holdDurationDays: number;
  /** Called on dismiss, so the page can move focus off the button that is going away. */
  onDismiss?: () => void;
}) {
  const [dismissed, setDismissed] = useState(wasDismissed);
  if (dismissed) return null;
  const duration = `${holdDurationDays} ${holdDurationDays === 1 ? 'day' : 'days'}`;
  return (
    <section aria-labelledby="how-holding-title" className="relative rounded-[18px] border-[1.5px] border-line bg-white p-4">
      <h2 id="how-holding-title" className="flex min-h-11 items-center pr-12 font-display text-xl">How holding a gift works</h2>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => { rememberDismissed(); setDismissed(true); onDismiss?.(); }}
        className="absolute top-2 right-2 grid size-11 place-items-center rounded-full text-2xl leading-none text-muted hover:text-ink"
      >
        <span aria-hidden="true">&times;</span>
      </button>
      <ol className="mt-3 list-decimal space-y-2 pl-6">
        <li><strong>Hold it before you buy it.</strong> Other guests see it&rsquo;s taken, so nobody buys it twice.</li>
        <li><strong>Buy it within {duration}.</strong> The hold is yours until then, and you can extend it once.</li>
        <li><strong>Come back and mark it purchased.</strong> If you don&rsquo;t, the hold ends after {duration} and another guest can buy the same gift.</li>
      </ol>
    </section>
  );
}
