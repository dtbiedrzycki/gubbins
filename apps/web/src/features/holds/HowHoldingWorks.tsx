/** Every hold can be extended exactly once (ADR-0002), so that clause always shows. */
export function HowHoldingWorks({ holdDurationDays }: { holdDurationDays: number }) {
  const duration = `${holdDurationDays} ${holdDurationDays === 1 ? 'day' : 'days'}`;
  return (
    <details open className="rounded-[18px] border-[1.5px] border-line bg-white p-4">
      <summary className="cursor-pointer font-display text-xl">How holding a gift works</summary>
      <ol className="mt-3 list-decimal space-y-2 pl-6">
        <li><strong>Hold it before you buy it.</strong> Other guests see it&rsquo;s taken, so nobody buys it twice.</li>
        <li><strong>Buy it within {duration}.</strong> The hold is yours until then, and you can extend it once.</li>
        <li><strong>Come back and mark it purchased.</strong> If you don&rsquo;t, the hold ends after {duration} and another guest can buy the same gift.</li>
      </ol>
    </details>
  );
}
