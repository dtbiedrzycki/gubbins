import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CopyButton } from './CopyButton';

const LINK = 'https://example.test/wishlists/abc123';

function renderCopy(clipboard: Partial<Clipboard> | undefined) {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  return render(
    <>
      <p id="link">{LINK}</p>
      <CopyButton text={LINK} label="Copy link" copiedLabel="Link copied" selectTargetId="link" />
    </>,
  );
}

/** Clicks, then lets the clipboard promise settle. */
async function press(name: string) {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name })); });
}

describe('CopyButton', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); window.getSelection()?.removeAllRanges(); });

  it('copies the text and shows the copied label for two seconds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const { container } = renderCopy({ writeText });
    const announcement = container.querySelector('[aria-live="polite"]');

    await press('Copy link');

    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeInTheDocument();
    expect(announcement).toHaveTextContent('Link copied');
    act(() => { vi.advanceTimersByTime(1999); });
    expect(screen.getByRole('button', { name: 'Link copied' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(announcement).toBeEmptyDOMElement();
  });

  it('a second press restarts the two seconds', async () => {
    renderCopy({ writeText: vi.fn().mockResolvedValue(undefined) });

    await press('Copy link');
    act(() => { vi.advanceTimersByTime(1500); });
    await press('Link copied');
    act(() => { vi.advanceTimersByTime(1500); });

    expect(screen.getByRole('button', { name: 'Link copied' })).toBeInTheDocument();
  });

  it('selects the text, and keeps its label, when the clipboard refuses', async () => {
    renderCopy({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });

    await press('Copy link');

    expect(window.getSelection()?.toString()).toBe(LINK);
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  it('selects the text when the browser has no clipboard, as over plain http', async () => {
    renderCopy(undefined);

    await press('Copy link');

    expect(window.getSelection()?.toString()).toBe(LINK);
  });
});
