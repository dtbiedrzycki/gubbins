/**
 * Whether a field's value has reached its `maxLength`, where a browser cuts a longer paste without saying so.
 * A field with another description links the warning only while this holds, so that description isn't read with a trailing blank.
 */
export function isAtLimit(value: string, max: number): boolean {
  return value.length >= max;
}

/**
 * Warns once a field is full. Always mounted, so screen readers announce the text when it appears.
 * No `role="status"`: forms find their own success message by that role.
 */
export function LengthLimitWarning({ id, value, max }: { id: string; value: string; max: number }) {
  return (
    <p id={id} aria-live="polite" className="text-sm text-amber-800 empty:hidden">
      {isAtLimit(value, max) ? `This is the limit of ${max} characters. If you pasted it, check that the end wasn't cut off.` : ''}
    </p>
  );
}
