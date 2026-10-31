import type { ManageViewResponse } from '@gubbins/shared-types';
import { formatMoney } from '../../lib/formatMoney';

export interface ManageItemsProps {
  slug: string;
  items: ManageViewResponse['items'];
  /** The server no longer accepts the owner cookie (404). */
  onUnauthorized: () => void;
}

export function ManageItems({ items }: ManageItemsProps) {
  return (
    <section aria-labelledby="manage-items-heading" className="space-y-2">
      <h2 id="manage-items-heading" className="text-lg font-semibold">Items</h2>
      <ul role="list">
        {items.map((item) => (
          <li key={item.id} className="border-b border-gray-200 py-3">
            <p className="break-words">
              {item.title}
              {item.type === 'group' && <span className="ml-2 text-sm text-gray-600">group gift</span>}
            </p>
            <p className="text-sm text-gray-600">
              {[
                item.priceMinor !== null && formatMoney(item.priceMinor),
                item.type === 'group' ? 'target' : `quantity ${item.quantity}`,
              ].filter(Boolean).join(' · ')}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
