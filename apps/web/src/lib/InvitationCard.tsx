import { listPath } from './links';
import { CopyButton } from './CopyButton';

export interface InvitationCardProps {
  guestKey: string;
  slug: string;
  /** The guest link is a real link (the ready screen) rather than plain text (the manage page). */
  linked?: boolean;
}

/** What the host hands out: the guest key and the guest link, each with a copy button. */
export function InvitationCard({ guestKey, slug, linked = false }: InvitationCardProps) {
  const guestLink = window.location.origin + listPath(slug);
  return (
    <div className="invite">
      <p className="text-center font-display text-[1.05rem] italic text-muted">Guests open the list with</p>
      <p id="invite-key" data-testid="guest-key" className="text-center text-[1.75rem] leading-tight font-bold wrap-anywhere">{guestKey}</p>
      <div className="flex flex-wrap justify-center gap-2 justify-self-center text-center">
        <CopyButton text={guestKey} label="Copy key" copiedLabel="Key copied" selectTargetId="invite-key" failedMessage="Couldn’t copy to the clipboard; the key is highlighted so you can copy it." />
      </div>
      <div className="flex flex-wrap items-center gap-2.5 border-t-[1.5px] border-dashed border-line pt-3.5">
        {linked
          ? <a id="invite-link" data-testid="guest-link" href={listPath(slug)} className="min-w-0 flex-1 text-[0.95rem] text-moss underline wrap-anywhere">{guestLink}</a>
          : <p id="invite-link" className="min-w-0 flex-1 text-[0.95rem] text-moss wrap-anywhere">{guestLink}</p>}
        <CopyButton text={guestLink} label="Copy link" copiedLabel="Link copied" selectTargetId="invite-link" failedMessage="Couldn’t copy to the clipboard; the link is highlighted so you can copy it." />
      </div>
    </div>
  );
}
