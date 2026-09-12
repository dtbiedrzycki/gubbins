import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { HoldItemRequest } from '@gubbins/shared-types';

export function useHoldItem(slug: string, itemId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: HoldItemRequest) => api.holdItem(slug, itemId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['listView', slug] });
    },
  });
}
