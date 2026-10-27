import { useEffect, useState } from 'react';

const SEEN_KEY = 'gubbins.holdingExplained';

/** Blocked or empty storage reads as not seen, so the box opens. */
function hasSeenExplanation(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === 'yes';
  } catch {
    return false;
  }
}

function rememberExplanationSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, 'yes');
  } catch {
    // Not remembered: the box opens again next visit.
  }
}

/**
 * Open on a guest's first visit on this device, closed after, so returning guests reach the items first.
 * Every hold can be extended exactly once (ADR-0002), so that clause always shows.
 */
export function HowHoldingWorks({ holdDurationDays }: { holdDurationDays: number }) {
  const [openAtFirst] = useState(() => !hasSeenExplanation());
  useEffect(rememberExplanationSeen, []);
  const duration = `${holdDurationDays} ${holdDurationDays === 1 ? 'day' : 'days'}`;
  return (
    <details open={openAtFirst} className="rounded-[18px] border-[1.5px] border-line bg-white p-4">
      <summary className="flex min-h-11 cursor-pointer items-center font-display text-xl">How holding a gift works</summary>
      <ol className="mt-3 list-decimal space-y-2 pl-6">
        <li><strong>Hold it before you buy it.</strong> Other guests see it&rsquo;s taken, so nobody buys it twice.</li>
        <li><strong>Buy it within {duration}.</strong> The hold is yours until then, and you can extend it once.</li>
        <li><strong>Come back and mark it purchased.</strong> If you don&rsquo;t, the hold ends after {duration} and another guest can buy the same gift.</li>
      </ol>
    </details>
  );
}
