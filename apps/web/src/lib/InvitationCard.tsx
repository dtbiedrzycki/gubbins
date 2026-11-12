import { invitePath } from './links';
import { CopyButton } from './CopyButton';

export interface InvitationCardProps {
  guestKey: string;
  slug: string;
  /** The guest link is a real link (the ready screen) rather than plain text (the manage page). */
  linked?: boolean;
}

/** What the host hands out: one guest link, with the key in its fragment, and a copy button. */
export function InvitationCard({ guestKey, slug, linked = false }: InvitationCardProps) {
  const guestLink = window.location.origin + invitePath(slug, guestKey);
  return (
    <div className="invite">
      <p className="text-center font-display text-[1.05rem] italic text-muted">Send guests this link</p>
      <div className="flex flex-wrap items-center gap-2.5">
        {linked
          ? <a id="invite-link" data-testid="guest-link" href={invitePath(slug, guestKey)} className="min-w-0 flex-1 text-[0.95rem] text-moss underline wrap-anywhere">{guestLink}</a>
          : <p id="invite-link" className="min-w-0 flex-1 text-[0.95rem] text-moss wrap-anywhere">{guestLink}</p>}
        <CopyButton text={guestLink} noun="link" selectTargetId="invite-link" />
      </div>
    </div>
  );
}
