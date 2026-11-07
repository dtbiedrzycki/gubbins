import { useState } from 'react';

export interface StepperProps {
  id: string;
  label: string;
  /** Styles the label, so it can double as a dialog's title. */
  labelClassName?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** Id of text that describes the count, such as how many are left. */
  describedBy?: string;
  /** The count is also a text box that takes only digits; a typed number snaps to the nearest allowed value. */
  typeable?: boolean;
}

/** A whole-number picker with "−" and "+" buttons, each 44px tall, so a count is easy to set on a phone. */
export function Stepper({ id, label, labelClassName = 'mb-1', value, min, max, onChange, disabled = false, describedBy, typeable = false }: StepperProps) {
  // What the owner typed, kept while it still stands for the value it reported; a new value from outside replaces it.
  const [draft, setDraft] = useState<{ text: string; value: number } | null>(null);
  const labelId = `${id}-label`;
  const button = 'h-11 w-12 text-[1.3rem] font-bold disabled:opacity-35 aria-disabled:opacity-35';
  const count = 'min-w-11 border-x-[1.5px] border-line text-center text-[1.15rem] leading-11 font-bold tabular-nums';
  // At an end a button is only marked disabled: a disabled attribute would drop a keyboard user's focus to <body>.
  const atMin = value <= min;
  const atMax = value >= max;
  // When typeable, the text box carries the name and description, so the label names one control.
  const named = { 'aria-labelledby': labelId, 'aria-describedby': describedBy };

  function type(text: string) {
    if (!/^\d*$/.test(text)) return;
    const next = text === '' ? value : Math.min(max, Math.max(min, Number(text)));
    setDraft({ text, value: next });
    if (next !== value) onChange(next);
  }

  return (
    <div>
      <p id={labelId} className={labelClassName}>{label}</p>
      <div role="group" {...(!typeable && named)} className="inline-flex items-center overflow-hidden rounded-[14px] border-[1.5px] border-ink bg-white">
        <button type="button" aria-label="One fewer" aria-disabled={atMin} onClick={() => { if (!atMin) onChange(value - 1); }} disabled={disabled} className={button}>−</button>
        {typeable ? (
          <input
            id={id} {...named} type="text" inputMode="numeric" autoComplete="off" disabled={disabled}
            value={draft?.value === value ? draft.text : String(value)}
            onChange={(e) => type(e.target.value)} onBlur={() => setDraft(null)}
            className={`${count} w-14 bg-transparent`}
          />
        ) : (
          // A span, not <output>: <output> is role="status", and a form keeps one status message.
          <span id={id} aria-live="polite" className={count}>{value}</span>
        )}
        <button type="button" aria-label="One more" aria-disabled={atMax} onClick={() => { if (!atMax) onChange(value + 1); }} disabled={disabled} className={button}>+</button>
      </div>
    </div>
  );
}
