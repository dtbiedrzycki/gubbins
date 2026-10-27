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
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [children, expanded]);

  return (
    <div>
      <div id={id} ref={ref} className={expanded ? undefined : 'line-clamp-2'}>
        {children}
      </div>
      {overflows && (
        <button
          type="button"
          className="text-sm underline"
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
