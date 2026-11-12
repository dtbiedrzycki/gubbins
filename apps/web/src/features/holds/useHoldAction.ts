import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { HoldView, ListViewResponse } from '@gubbins/shared-types';
import { api, isNetworkFailure } from '../../api/client';
import { listViewKey } from './useListView';

export type HoldAction = 'extend' | 'release' | 'purchase';

/** What each action is sent: a purchase also says how many units were bought, and any message to the owner. */
interface HoldActionInputs {
  extend: { holdId: string };
  release: { holdId: string };
  purchase: { holdId: string; units: number; message: string };
}

const call: { [A in HoldAction]: (slug: string, input: HoldActionInputs[A]) => Promise<HoldView> } = {
  extend: (slug, { holdId }) => api.extendHold(slug, holdId),
  release: (slug, { holdId }) => api.releaseHold(slug, holdId),
  purchase: (slug, { holdId, units, message }) => api.markHoldPurchased(slug, holdId, units, message),
};

/**
 * One action on one hold. Settles by refetching the list view: after a
 * success the item's status changed, and after a 409 the page was stale —
 * the hold lapsed, or another tab acted — so the refetch is what shows the
 * guest the real state. After a success or an answered refusal it stays
 * pending until that refetch lands, like useHoldItem: a refusal is reported
 * with this hold as it now stands (undefined once it has left the list), so
 * the caller can tell a repeat of an action that already worked from a real
 * refusal. After a request that got no answer it does not wait: the refetch
 * would most likely hang on the same network, so the failure is reported at
 * once with the hold as cached, and the refetch finishes in the background.
 *
 * `onSuccess` and `onError` are hook-level options rather than `mutate`
 * callbacks on purpose: a released hold drops out of the refetched list and
 * its component unmounts, and TanStack skips `mutate` callbacks for an
 * unmounted component — the outcome would never be shown.
 */
export function useHoldAction<A extends HoldAction>(
  slug: string,
  action: A,
  { onSuccess, onError }: { onSuccess?: (view: HoldView) => void; onError?: (error: Error, refetched: HoldView | undefined) => void } = {},
) {
  const queryClient = useQueryClient();
  const refetch = () => queryClient.invalidateQueries({ queryKey: listViewKey(slug) });
  return useMutation({
    mutationFn: (input: HoldActionInputs[A]) => call[action](slug, input),
    onSuccess: async (view) => {
      onSuccess?.(view);
      await refetch();
    },
    onError: async (error, { holdId }) => {
      // No answer: the refetch would likely wait on the same dead network, so
      // report now with the cached hold; the list catches up in the background.
      if (isNetworkFailure(error)) void refetch();
      else await refetch();
      onError?.(error, queryClient.getQueryData<ListViewResponse>(listViewKey(slug))?.myHolds.find((hold) => hold.holdId === holdId));
    },
  });
}
