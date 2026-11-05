export interface StepperProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** Id of text that describes the count, such as how many are left. */
  describedBy?: string;
}

/** A whole-number picker with "−" and "+" buttons, each 44px tall, so a count is easy to set on a phone. */
export function Stepper({ id, label, value, min, max, onChange, disabled = false, describedBy }: StepperProps) {
  const labelId = `${id}-label`;
  const button = 'h-11 w-12 text-[1.3rem] font-bold disabled:opacity-35';
  return (
    <div>
      <p id={labelId} className="mb-1">{label}</p>
      <div role="group" aria-labelledby={labelId} aria-describedby={describedBy} className="inline-flex items-center overflow-hidden rounded-[14px] border-[1.5px] border-ink bg-white">
        <button type="button" aria-label="One fewer" onClick={() => onChange(value - 1)} disabled={disabled || value <= min} className={button}>−</button>
        <output id={id} aria-live="polite" className="min-w-11 border-x-[1.5px] border-line text-center text-[1.15rem] leading-11 font-bold tabular-nums">{value}</output>
        <button type="button" aria-label="One more" onClick={() => onChange(value + 1)} disabled={disabled || value >= max} className={button}>+</button>
      </div>
    </div>
  );
}
