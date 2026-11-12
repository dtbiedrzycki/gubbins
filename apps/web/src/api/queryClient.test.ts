import { afterEach, describe, expect, it } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { ApiError } from './client';
import { queryClient } from './queryClient';

const offline = () => Promise.reject(new ApiError(0, 'offline'));

describe('queryClient', () => {
  afterEach(() => onlineManager.setOnline(true));

  it.each([
    [
      'mutation',
      async () => {
        const mutation = queryClient.getMutationCache().build(queryClient, { mutationFn: offline });
        await expect(mutation.execute(undefined)).rejects.toMatchObject({ status: 0 });
        expect(mutation.state.status).toBe('error');
      },
    ],
    [
      'query',
      async () => {
        await expect(queryClient.fetchQuery({ queryKey: ['offline'], queryFn: offline, retry: false })).rejects.toMatchObject({ status: 0 });
        expect(queryClient.getQueryState(['offline'])?.status).toBe('error');
      },
    ],
  ])('fails a %s at once when the browser says it is offline', async (_kind, run) => {
    onlineManager.setOnline(false);

    await run();
  });
});
