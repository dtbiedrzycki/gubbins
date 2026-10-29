import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Blocked or empty storage reads as expanded. */
function readExpanded(key: string): boolean {
  try {
    return localStorage.getItem(key) !== 'collapsed';
  } catch {
    return true;
  }
}

function writeExpanded(key: string, expanded: boolean): void {
  try {
    localStorage.setItem(key, expanded ? 'expanded' : 'collapsed');
  } catch {
    // Not remembered: the text starts expanded next visit.
  }
}

/**
 * Clamps to two lines with a Show more toggle. With `rememberAs`, it starts
 * expanded instead and remembers the guest's last toggle under that storage key.
 */
export function ClampedText({ children, id, rememberAs }: { children: ReactNode; id: string; rememberAs?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(() => rememberAs !== undefined && readExpanded(rememberAs));

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Clamped just for the reading, so it works while expanded too; nothing paints in between.
    const measure = () => {
      const clamped = el.classList.contains('line-clamp-2');
      el.classList.add('line-clamp-2');
      setOverflows(el.scrollHeight > el.clientHeight);
      if (!clamped) el.classList.remove('line-clamp-2');
    };
    measure();
    let cancelled = false;
    // Web fonts swap in after first paint and can add a line.
    void document.fonts?.ready.then(() => {
      if (!cancelled) measure();
    });
    window.addEventListener('resize', measure);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', measure);
    };
  }, [children]);

  return (
    <div>
      {/* Focus on a clipped link would be invisible, so expand. */}
      <div
        id={id}
        ref={ref}
        className={expanded ? undefined : 'line-clamp-2'}
        onFocus={() => setExpanded(true)}
      >
        {children}
      </div>
      {overflows && (
        <button
          type="button"
          className="inline-flex min-h-11 items-center font-bold text-moss underline"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => {
            setExpanded(!expanded);
            if (rememberAs) writeExpanded(rememberAs, !expanded);
          }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
