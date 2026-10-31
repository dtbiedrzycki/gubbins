import type { ManageViewResponse } from '@gubbins/shared-types';
import { formatMoney } from '../../lib/formatMoney';

export interface ManageItemsProps {
  items: ManageViewResponse['items'];
}

export function ManageItems({ items }: ManageItemsProps) {
  return (
    <section aria-labelledby="manage-items-heading" className="space-y-2">
      <h2 id="manage-items-heading" className="text-[0.8rem] font-bold uppercase tracking-[0.06em] text-muted">Items</h2>
      <ul role="list" className="space-y-2">
        {items.map((item) => {
          // A group gift always has a price; the type is nullable only because singles may lack one.
          const meta = item.type === 'group'
            ? `${formatMoney(item.priceMinor ?? 0)} target`
            : [item.priceMinor === null ? null : formatMoney(item.priceMinor), `quantity ${item.quantity}`].filter(Boolean).join(' · ');
          return (
            <li key={item.id} className="grid gap-2 rounded-[10px] border border-line bg-white px-3.5 py-3">
              <p className="font-bold break-words">
                {item.title}
                {item.type === 'group' && <span className="ml-2 text-sm font-normal text-muted">group gift</span>}
              </p>
              <p className="text-[0.92rem] text-muted">{meta}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
