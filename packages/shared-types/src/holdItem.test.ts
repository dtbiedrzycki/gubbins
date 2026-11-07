import { describe, expect, it } from 'vitest';
import { holdItemRequestSchema } from './holdItem.js';

describe('holdItemRequestSchema', () => {
  it('rejects a hold request without units, rather than picking a count for the guest', () => {
    expect(holdItemRequestSchema.safeParse({ idempotencyKey: 'k', name: 'Ada' }).success).toBe(false);
  });
});
