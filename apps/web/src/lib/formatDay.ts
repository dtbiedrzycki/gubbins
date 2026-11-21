/** "Nov 12", with the year only when it isn't `at`'s, in the viewer's own locale and time zone. */
export function formatDay(iso: string, at: Date): string {
  const day = new Date(iso);
  const withYear = day.getFullYear() !== at.getFullYear();
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', ...(withYear && { year: 'numeric' }) }).format(day);
}
