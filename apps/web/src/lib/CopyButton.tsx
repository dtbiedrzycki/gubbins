import { useEffect, useRef, useState } from 'react';

export interface CopyButtonProps {
  text: string;
  label: string;
  /** Shown on the button, and announced, for two seconds after a copy. */
  copiedLabel: string;
  /** The element holding the text, selected instead when the clipboard is unavailable (e.g. over plain http). */
  selectTargetId: string;
}

const COPIED_MS = 2000;

export function CopyButton({ text, label, copiedLabel, selectTargetId }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function selectText() {
    const target = document.getElementById(selectTargetId);
    if (target) window.getSelection()?.selectAllChildren(target);
  }

  function copy() {
    // Called inside the click handler: browsers only allow clipboard writes from a user gesture.
    const write = navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('No clipboard'));
    write.then(() => {
      clearTimeout(timer.current);
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    }, selectText);
  }

  return (
    <>
      <button type="button" onClick={copy} className={copied ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>
        {copied ? copiedLabel : label}
      </button>
      {/* No `role="status"`: forms on the same page find their own success message by that role. */}
      <span aria-live="polite" className="sr-only">{copied ? copiedLabel : ''}</span>
    </>
  );
}
