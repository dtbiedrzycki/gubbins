import type { MoveTarget } from '../../api/client';

export interface MoveItemButtonsProps {
  title: string;
  itemId: string;
  index: number;
  count: number;
  /** A move is in flight: taps are ignored until it settles. */
  pending: boolean;
  onMove(to: MoveTarget): void;
}

// Row 1 moves the gift up (one place, or to the top); row 2 moves it down.
const buttons: Array<{ to: MoveTarget; name: string; path: string }> = [
  { to: 'up', name: 'up', path: 'M12 19V6M6 12l6-6 6 6' },
  { to: 'top', name: 'to the top', path: 'M5 4h14M12 20V9M7 13l5-5 5 5' },
  { to: 'down', name: 'down', path: 'M12 5v13M6 12l6 6 6-6' },
  { to: 'bottom', name: 'to the bottom', path: 'M5 20h14M12 4v11M7 11l5 5 5-5' },
];

/** The two-by-two block beside a gift that moves it within the list. */
export function MoveItemButtons({ title, itemId, index, count, pending, onMove }: MoveItemButtonsProps) {
  return (
    <div role="group" aria-label={`Move ${title}`} className="grid grid-cols-2 gap-1.5">
      {buttons.map(({ to, name, path }) => (
        <button
          key={to} id={`move-${to}-${itemId}`} type="button" aria-label={`Move ${title} ${name}`}
          disabled={to === 'up' || to === 'top' ? index === 0 : index === count - 1}
          aria-disabled={pending || undefined} onClick={() => { if (!pending) onMove(to); }}
          className="btn-secondary btn-sm grid size-11 place-items-center px-0"
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={path} />
          </svg>
        </button>
      ))}
    </div>
  );
}
