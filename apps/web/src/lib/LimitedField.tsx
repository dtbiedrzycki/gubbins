import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface LimitProps {
  id: string;
  value: string;
  max: number;
  /** Ids of the field's other descriptions; a `false` entry is skipped, so a hint can be passed only while it shows. */
  describedBy?: (string | false)[];
}

/**
 * The field's `maxLength` and description, plus the warning to render after it.
 * The warning is linked only once the field is full, so an empty one isn't read as a trailing blank.
 */
function limit({ id, value, max, describedBy = [] }: LimitProps) {
  const warningId = `${id}-limit`;
  const full = value.length >= max;
  return {
    fieldProps: { id, value, maxLength: max, 'aria-describedby': [...describedBy, full && warningId].filter(Boolean).join(' ') || undefined },
    // Always mounted, so screen readers announce the text when it appears. No `role="status"`: forms find their own success message by that role.
    warning: (
      <p id={warningId} aria-live="polite" className="text-sm text-amber-800 empty:hidden">
        {full ? `This is the limit of ${max} characters. If you pasted it, check that the end wasn't cut off.` : ''}
      </p>
    ),
  };
}

type Omitted = 'id' | 'value' | 'maxLength' | 'aria-describedby';

/** An input that stops at `max` characters and warns once it is full, where a browser cuts a longer paste without saying so. */
export function LimitedInput({ id, value, max, describedBy, ...props }: LimitProps & Omit<InputHTMLAttributes<HTMLInputElement>, Omitted>) {
  const { fieldProps, warning } = limit({ id, value, max, describedBy });
  return <><input {...props} {...fieldProps} />{warning}</>;
}

/** A textarea that stops at `max` characters and warns once it is full, like {@link LimitedInput}. */
export function LimitedTextarea({ id, value, max, describedBy, ...props }: LimitProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, Omitted>) {
  const { fieldProps, warning } = limit({ id, value, max, describedBy });
  return <><textarea {...props} {...fieldProps} />{warning}</>;
}
