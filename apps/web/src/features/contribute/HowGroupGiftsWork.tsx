import { useState } from 'react';

const DISMISSED_KEY = 'gubbins.groupGiftExplainerDismissed';

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
 * Tells guests the money goes straight to the host, who buys the gift.
 * Always names both payment apps: the chip-in dialog shows whichever the host set up.
 */
export function HowGroupGiftsWork({ onDismiss }: {
  /** Called on dismiss, so the page can move focus off the button that is going away. */
  onDismiss?: () => void;
}) {
  const [dismissed, setDismissed] = useState(wasDismissed);
  if (dismissed) return null;
  return (
    <section aria-labelledby="how-group-gifts-title" className="relative rounded-[18px] border-[1.5px] border-line bg-white p-4">
      <h2 id="how-group-gifts-title" className="flex min-h-11 items-center pr-12 font-display text-xl">How group gifts work</h2>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => { rememberDismissed(); setDismissed(true); onDismiss?.(); }}
        className="absolute top-2 right-2 grid size-11 place-items-center rounded-full text-2xl leading-none text-muted hover:text-ink"
      >
        <span aria-hidden="true">&times;</span>
      </button>
      <ol className="mt-3 list-decimal space-y-2 pl-6">
        <li><strong>Chip in any amount.</strong> Guests pool money toward one bigger gift.</li>
        <li><strong>Send it straight to the host.</strong> When you chip in, we&rsquo;ll show you how to pay the host with Venmo or Zelle.</li>
        <li><strong>The host buys the gift.</strong> They use what everyone sent to buy it.</li>
      </ol>
    </section>
  );
}
