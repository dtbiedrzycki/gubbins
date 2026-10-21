export interface ItemAnnouncementProps {
  message: string;
}

/** role="status" + aria-live="polite" together, explicitly — ADR-025: screen-reader status changes use ARIA live regions. */
export function ItemAnnouncement({ message }: ItemAnnouncementProps) {
  return (
    <p role="status" aria-live="polite" className="font-medium text-green-700 empty:mb-0">
      {message}
    </p>
  );
}
