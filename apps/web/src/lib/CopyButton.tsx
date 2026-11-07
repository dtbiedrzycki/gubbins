import { useEffect, useRef, useState } from 'react';

export interface CopyButtonProps {
  text: string;
  label: string;
  /** Shown on the button, and announced, for two seconds after a copy. */
  copiedLabel: string;
  /** The element holding the text, selected instead when the clipboard is unavailable (e.g. over plain http). */
  selectTargetId: string;
  /** Shown under the row, and announced, for two seconds when the copy fails and the text is selected instead. */
  failedMessage: string;
}

const COPIED_MS = 2000;

export function CopyButton({ text, label, copiedLabel, selectTargetId, failedMessage }: CopyButtonProps) {
  const [outcome, setOutcome] = useState<'copied' | 'failed' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function show(next: 'copied' | 'failed') {
    clearTimeout(timer.current);
    setOutcome(next);
    timer.current = setTimeout(() => setOutcome(null), COPIED_MS);
  }

  function selectText() {
    const target = document.getElementById(selectTargetId);
    if (target) window.getSelection()?.selectAllChildren(target);
    show('failed');
  }

  function copy() {
    // Called inside the click handler: browsers only allow clipboard writes from a user gesture.
    const write = navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('No clipboard'));
    write.then(() => show('copied'), selectText);
  }

  return (
    <>
      <button type="button" onClick={copy} className={outcome === 'copied' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>
        {outcome === 'copied' ? copiedLabel : label}
      </button>
      {/* No `role="status"`: forms on the same page find their own success message by that role. */}
      {/* One live region for both outcomes; it is visible, on a line of its own in a wrapping row, only for a failure. */}
      <span aria-live="polite" className={outcome === 'failed' ? 'basis-full text-sm' : 'sr-only'}>
        {outcome === 'copied' ? copiedLabel : outcome === 'failed' ? failedMessage : ''}
      </span>
    </>
  );
}
