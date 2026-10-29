import type { ListViewResponse } from '@gubbins/shared-types';

type ListItem = NonNullable<ListViewResponse['items']>[number];

/** Test fixture: a single, available stroller; override what a test cares about. */
export const aListItem = (over: Partial<ListItem> = {}): ListItem => ({
  id: 'item-1', title: 'Stroller', type: 'single', status: 'available', availableUnits: 1, url: null, priceMinor: null, pledgedMinor: null, ...over,
});
