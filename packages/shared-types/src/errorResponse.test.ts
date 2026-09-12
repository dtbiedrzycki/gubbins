import { describe, expect, it } from 'vitest';
import { errorResponseSchema } from './errorResponse.js';

describe('errorResponseSchema', () => {
  it('accepts a bare message', () => {
    const result = errorResponseSchema.safeParse({ message: 'Not found' });
    expect(result.success).toBe(true);
  });

  it('accepts a message with zod issues', () => {
    const result = errorResponseSchema.safeParse({ message: 'Invalid request', issues: [{ path: ['listTitle'] }] });
    expect(result.success).toBe(true);
  });

  it('rejects a response with no message', () => {
    const result = errorResponseSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
