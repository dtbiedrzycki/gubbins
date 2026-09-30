import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

/**
 * The list view's query key. Anything that invalidates the list view must
 * build its key here too: if a hand-written copy of the key drifts, the
 * invalidation silently stops matching and nothing fails.
 */
export const listViewKey = (slug: string | undefined) => ['listView', slug] as const;

export function useListView(slug: string | undefined) {
  return useQuery({
    queryKey: listViewKey(slug),
    queryFn: () => api.getListView(slug as string),
    // Without this, TanStack Query still fires the query on mount even
    // though the caller has nothing valid to pass — it doesn't know a
    // missing slug means "don't run this," only that `enabled` says so.
    enabled: Boolean(slug),
  });
}
