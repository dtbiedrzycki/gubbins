import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { listViewKey } from './useListView';
import type { HoldItemRequest, ListViewResponse } from '@gubbins/shared-types';

export function useHoldItem(slug: string, itemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: HoldItemRequest) => api.holdItem(slug, itemId, input),
    // The server confirmed the hold, so "Your holds" can show it even if the
    // refetch below fails. The item's status is left to the server: with
    // more than one unit, it may still be available.
    onSuccess: (hold) => queryClient.setQueryData<ListViewResponse>(listViewKey(slug), (view) =>
      view && { ...view, myHolds: [...view.myHolds.filter((h) => h.holdId !== hold.holdId), hold] }),
    // On settled rather than on success: a failed hold (usually a 409,
    // because someone else holds the item) also means the cached list view
    // is stale. Returning the promise keeps the mutation pending until the
    // refetch lands, so the held state comes from fresh server data rather
    // than only from this component's own `isSuccess`.
    onSettled: () => queryClient.invalidateQueries({ queryKey: listViewKey(slug) }),
  });
}
