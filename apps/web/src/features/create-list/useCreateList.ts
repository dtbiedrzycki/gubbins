import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { CreateListRequest } from '@gubbins/shared-types';

export function useCreateList() {
  return useMutation({
    mutationFn: (input: CreateListRequest) => api.createList(input),
  });
}
