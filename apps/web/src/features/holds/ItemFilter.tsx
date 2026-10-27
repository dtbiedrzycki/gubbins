import type { ListViewResponse } from '@gubbins/shared-types';
import { Seal } from './Seal';

type Item = NonNullable<ListViewResponse['items']>[number];
export type ItemFilterValue = 'all' | 'available' | 'held' | 'purchased';

/** Which filter a gift falls under: a fully pledged group gift counts as purchased. */
export function filterKey(item: Item): Exclude<ItemFilterValue, 'all'> {
  const funded = item.type === 'group' && item.priceMinor != null && (item.pledgedMinor ?? 0) >= item.priceMinor;
  return item.status === 'purchased' || funded ? 'purchased' : item.status;
}

const options: { value: ItemFilterValue; label: string; seal?: 'wax' | 'gold' }[] = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'Available' },
  { value: 'held', label: 'Held', seal: 'wax' },
  { value: 'purchased', label: 'Purchased or funded', seal: 'gold' },
];

export interface ItemFilterProps {
  items: Item[];
  value: ItemFilterValue;
  onChange: (value: ItemFilterValue) => void;
}

export function ItemFilter({ items, value, onChange }: ItemFilterProps) {
  const count = (v: ItemFilterValue) => (v === 'all' ? items.length : items.filter((i) => filterKey(i) === v).length);
  return (
    <div role="group" aria-label="Show gifts" className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border-[1.5px] border-ink py-1 pr-3.5 text-[15px] font-bold ${o.seal ? 'pl-2' : 'pl-3.5'} ${value === o.value ? 'bg-ink text-white' : 'bg-white text-ink'}`}
        >
          {o.seal && <Seal tone={o.seal} size="sm" />}
          {o.label} · {count(o.value)}
        </button>
      ))}
    </div>
  );
}
