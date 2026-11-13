import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useListTheme } from './useListTheme';

describe('useListTheme', () => {
  it('puts the style on the page, and takes it off when the page goes', () => {
    const { unmount } = renderHook(() => useListTheme('groovy'));
    expect(document.documentElement.dataset.listTheme).toBe('groovy');

    unmount();
    expect(document.documentElement.dataset.listTheme).toBeUndefined();
  });
});
