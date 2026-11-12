import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { EnterGuestKeyRequest } from '@gubbins/shared-types';

/** Posts the key, then runs `onEntered` (the list load), so `isPending` covers both; `opening` is the second part. */
export function useEnterGuestKey(slug: string, onEntered: () => Promise<unknown>) {
  const [opening, setOpening] = useState(false);
  const mutation = useMutation({
    mutationFn: async (input: EnterGuestKeyRequest) => {
      await api.enterGuestKey(slug, input);
      setOpening(true);
      try {
        await onEntered();
      } finally {
        setOpening(false);
      }
    },
  });
  return { ...mutation, opening };
}
