import { QueryClient } from '@tanstack/react-query';

// staleTime avoids redundant refetches on every component mount —
// tuned here rather than left at TanStack Query's zero default.
// networkMode 'always': the default pauses a request while the browser
// reports offline, leaving the guest in a pending dialog with no way out.
// Sending it lets it fail at once (or time out) instead.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, networkMode: 'always' },
    mutations: { networkMode: 'always' },
  },
});
