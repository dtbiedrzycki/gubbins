import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ClampedText } from './ClampedText';

function stubHeights(scrollHeight: number, clientHeight: number) {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: clientHeight });
}

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
});

describe('ClampedText', () => {
  it('offers Show more only when the text overflows two lines', () => {
    stubHeights(40, 40);
    const { unmount } = render(<ClampedText id="d">short</ClampedText>);
    expect(screen.queryByRole('button')).toBeNull();
    unmount();

    stubHeights(80, 40);
    render(<ClampedText id="d">long</ClampedText>);
    expect(screen.getByRole('button', { name: 'Show more' })).toBeTruthy();
  });

  it('toggles between Show more and Show less', () => {
    stubHeights(80, 40);
    render(<ClampedText id="d">long</ClampedText>);
    const button = screen.getByRole('button', { name: 'Show more' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('d');
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Show less' }).getAttribute('aria-expanded')).toBe('true');
  });
});
