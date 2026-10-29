import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClampedText } from './ClampedText';

function stubHeights(scrollHeight: number, clientHeight: number) {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: clientHeight });
}

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  Reflect.deleteProperty(document, 'fonts');
  vi.restoreAllMocks();
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

  it('re-measures once web fonts finish loading', async () => {
    let fontsLoaded!: () => void;
    const ready = new Promise<void>((resolve) => (fontsLoaded = resolve));
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready } });
    stubHeights(40, 40);
    render(<ClampedText id="d">long</ClampedText>);
    expect(screen.queryByRole('button')).toBeNull();

    stubHeights(80, 40);
    await act(async () => fontsLoaded());
    expect(screen.getByRole('button', { name: 'Show more' })).toBeTruthy();
  });

  it('expands when keyboard focus enters the clamped text', () => {
    stubHeights(80, 40);
    render(
      <ClampedText id="d">
        <a href="https://example.com">site</a>
      </ClampedText>,
    );
    fireEvent.focus(screen.getByRole('link'));
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy();
  });

  it("starts expanded, offering Show less, when it remembers the guest's choice", () => {
    stubHeights(80, 40);
    render(<ClampedText id="d" rememberAs="test.expanded">long</ClampedText>);
    expect(screen.getByRole('button', { name: 'Show less' }).getAttribute('aria-expanded')).toBe('true');
  });

  it("remembers the guest's last choice on this device", () => {
    stubHeights(80, 40);
    const first = render(<ClampedText id="d" rememberAs="test.expanded">long</ClampedText>);
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    first.unmount();
    const second = render(<ClampedText id="d" rememberAs="test.expanded">long</ClampedText>);
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    second.unmount();

    render(<ClampedText id="d" rememberAs="test.expanded">long</ClampedText>);
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy();
  });

  it('starts expanded every visit where storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    stubHeights(80, 40);
    const first = render(<ClampedText id="d" rememberAs="test.expanded">long</ClampedText>);
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    first.unmount();

    render(<ClampedText id="d" rememberAs="test.expanded">long</ClampedText>);
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy();
  });
});
