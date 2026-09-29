import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

/**
 * The list view's query key. Anything that invalidates the list view must
 * build its key here too: if a hand-written copy of the key drifts, the
 * invalidation silently stops matching and nothing fails.
 */
export const listViewKey = (slug: string) => ['listView', slug] as const;

export function useListView(slug: string) {
  return useQuery({
    queryKey: listViewKey(slug),
    queryFn: () => api.getListView(slug),
  });
}
