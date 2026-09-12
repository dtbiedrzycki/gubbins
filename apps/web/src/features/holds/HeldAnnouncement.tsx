export interface HeldAnnouncementProps {
  message: string;
}

/** role="status" + aria-live="polite" together, explicitly — ADR-025: screen-reader status changes use ARIA live regions. */
export function HeldAnnouncement({ message }: HeldAnnouncementProps) {
  return (
    <p role="status" aria-live="polite" className="font-medium text-green-700">
      {message}
    </p>
  );
}
