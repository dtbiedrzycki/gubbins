/** Shown once a field is full, because a browser cuts a longer paste at `maxLength` without saying so. */
export function lengthLimitWarning(value: string, max: number): string {
  return value.length >= max ? `This is the limit of ${max} characters. If you pasted it, check that the end wasn't cut off.` : '';
}
