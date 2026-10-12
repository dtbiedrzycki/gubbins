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

  it('accepts a 409 code', () => {
    expect(errorResponseSchema.safeParse({ message: 'This hold is no longer active.', code: 'hold_not_active' }).success).toBe(true);
  });

  it('rejects a code outside the documented set', () => {
    expect(errorResponseSchema.safeParse({ message: 'x', code: 'teapot' }).success).toBe(false);
  });
});
