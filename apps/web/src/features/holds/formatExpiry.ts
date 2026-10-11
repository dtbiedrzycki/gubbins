/**
 * An expiry instant in the guest's own locale and time zone. Lists have no
 * time zone of their own yet, so the browser's is the most useful one to show.
 */
export function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}
