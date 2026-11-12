import { afterEach, describe, expect, it } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { ApiError } from './client';
import { queryClient } from './queryClient';

describe('queryClient', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('fails a mutation at once when the browser says it is offline', async () => {
    onlineManager.setOnline(false);

    const mutation = queryClient.getMutationCache().build(queryClient, {
      mutationFn: () => Promise.reject(new ApiError(0, 'offline')),
    });

    await expect(mutation.execute(undefined)).rejects.toMatchObject({ status: 0 });
    expect(mutation.state.status).toBe('error');
  });
});
