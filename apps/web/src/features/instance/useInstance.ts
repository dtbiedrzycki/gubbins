import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

export function useInstance() {
  return useQuery({ queryKey: ['instance'], queryFn: api.getInstance, staleTime: Infinity });
}
