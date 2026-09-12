import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { EnterGuestKeyRequest } from '@gubbins/shared-types';

export function useEnterGuestKey(slug: string) {
  return useMutation({
    mutationFn: (input: EnterGuestKeyRequest) => api.enterGuestKey(slug, input),
  });
}
