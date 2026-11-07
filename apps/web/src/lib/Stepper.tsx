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
}

/** A whole-number picker with "−" and "+" buttons, each 44px tall, so a count is easy to set on a phone. */
export function Stepper({ id, label, labelClassName = 'mb-1', value, min, max, onChange, disabled = false, describedBy }: StepperProps) {
  const labelId = `${id}-label`;
  const button = 'h-11 w-12 text-[1.3rem] font-bold disabled:opacity-35 aria-disabled:opacity-35';
  // A span, not <output>: <output> is role="status", and a form keeps one status message.
  // At an end a button is only marked disabled: a disabled attribute would drop a keyboard user's focus to <body>.
  const atMin = value <= min;
  const atMax = value >= max;
  return (
    <div>
      <p id={labelId} className={labelClassName}>{label}</p>
      <div role="group" aria-labelledby={labelId} aria-describedby={describedBy} className="inline-flex items-center overflow-hidden rounded-[14px] border-[1.5px] border-ink bg-white">
        <button type="button" aria-label="One fewer" aria-disabled={atMin} onClick={() => { if (!atMin) onChange(value - 1); }} disabled={disabled} className={button}>−</button>
        <span id={id} aria-live="polite" className="min-w-11 border-x-[1.5px] border-line text-center text-[1.15rem] leading-11 font-bold tabular-nums">{value}</span>
        <button type="button" aria-label="One more" aria-disabled={atMax} onClick={() => { if (!atMax) onChange(value + 1); }} disabled={disabled} className={button}>+</button>
      </div>
    </div>
  );
}
