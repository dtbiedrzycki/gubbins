import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { HoldView } from '@gubbins/shared-types';
import { api } from '../../api/client';
import { listViewKey } from './useListView';

export type HoldAction = 'extend' | 'release' | 'purchase';

const call: Record<HoldAction, (slug: string, holdId: string) => Promise<HoldView>> = {
  extend: api.extendHold,
  release: api.releaseHold,
  purchase: api.markHoldPurchased,
};

/**
 * One action on one hold. Settles by refetching the list view: after a
 * success the item's status changed, and after a 409 the page was stale —
 * the hold lapsed, or another tab acted — so the refetch is what shows the
 * guest the real state. Stays pending until that refetch lands, like
 * useHoldItem.
 *
 * `onSuccess` and `onError` are hook-level options rather than `mutate`
 * callbacks on purpose: a released hold drops out of the refetched list and
 * its component unmounts, and TanStack skips `mutate` callbacks for an
 * unmounted component — the outcome would never be shown.
 */
export function useHoldAction(
  slug: string,
  action: HoldAction,
  { onSuccess, onError }: { onSuccess?: (view: HoldView) => void; onError?: (error: Error) => void } = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (holdId: string) => call[action](slug, holdId),
    onSuccess,
    onError,
    onSettled: () => queryClient.invalidateQueries({ queryKey: listViewKey(slug) }),
  });
}
