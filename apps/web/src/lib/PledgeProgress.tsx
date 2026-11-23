import { formatMoney } from './formatMoney';

export interface PledgeProgressProps {
  pledgedMinor: number;
  priceMinor: number;
}

/** A group gift's pledges against its price: the line guests and the owner read, and the coin bar under it. */
export function PledgeProgress({ pledgedMinor, priceMinor }: PledgeProgressProps) {
  // Integer minor units, multiplied before dividing so the floor is exact; rounding down
  // keeps a gift short of its price from reading 100%.
  const percent = (pledgedMinor * 100) / priceMinor;
  const progress = `${formatMoney(pledgedMinor)} of ${formatMoney(priceMinor)} pledged · ${Math.floor(percent)}%`;
  return (
    <div className="space-y-1.5">
      {/* No progress-bar role: screen readers would hear this line's amount twice. */}
      <p>{progress}</p>
      {/* Gold coins laid along a bar, filled to the pledged share and never past full. */}
      <div className="h-4 overflow-hidden rounded-lg border-2 border-ink bg-white">
        <div data-bar-fill className="h-full bg-gold bg-[radial-gradient(circle_at_30%_50%,#F3D27A_0_3px,transparent_3.5px)] bg-[length:10px_12px]" style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
    </div>
  );
}
