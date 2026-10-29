import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export function ClampedText({ children, id }: { children: ReactNode; id: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measured only while clamped; once expanded the text is known to overflow.
    const measure = () => {
      if (!expanded) setOverflows(el.scrollHeight > el.clientHeight);
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
  }, [children, expanded]);

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
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
