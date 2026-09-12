import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

export function useListView(slug: string) {
  return useQuery({
    queryKey: ['listView', slug],
    queryFn: () => api.getListView(slug),
  });
}
