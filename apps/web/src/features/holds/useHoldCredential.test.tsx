import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHoldCredential } from './useHoldCredential';

describe('useHoldCredential', () => {
  it('mints the idempotency key once, when it mounts, and keeps it across re-renders', () => {
    const { result, rerender } = renderHook(() => useHoldCredential());
    const minted = result.current.idempotencyKey;

    rerender();
    rerender();

    expect(result.current.idempotencyKey).toBe(minted);
    expect(minted).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('mints a fresh key for each mount — each opening of the dialog', () => {
    const first = renderHook(() => useHoldCredential()).result.current.idempotencyKey;
    const second = renderHook(() => useHoldCredential()).result.current.idempotencyKey;
    expect(second).not.toBe(first);
  });
});
