import { useEffect, useRef, useState } from 'react';
import type { ListViewResponse } from '@gubbins/shared-types';
import { useHoldItem } from './useHoldItem';
import { storeHost } from '../../lib/storeHost';
import { HoldDialog } from './HoldDialog';
import { purchasedMessage } from './purchasedMessage';
import { ItemAnnouncement } from './ItemAnnouncement';
import { Seal } from './Seal';
import { formatMoney } from '../../lib/formatMoney';
import { ClampedText } from '../../lib/ClampedText';
import { PledgeProgress } from '../../lib/PledgeProgress';
import { Markdown } from '../../lib/Markdown';
import { ContributeDialog } from '../contribute/ContributeDialog';
import type { ContributeDraft } from '../contribute/contributeDraft';

export interface ItemViewProps {
  slug: string;
  item: NonNullable<ListViewResponse['items']>[number];
  holdDurationDays: number;
  payment: ListViewResponse['payment'];
  /** Units in this guest's active holds on the item. */
  heldUnits: number;
  /** What this guest has pledged to the item, in minor units. */
  chippedInMinor: number;
  /** A chip-in to this gift the guest left to pay: it opens again on arrival. */
  draft?: ContributeDraft;
  /** The chip-in closed, so a draft it opened from is done with. */
  onChipInClosed?: () => void;
  /** What a done action in Your contributions did to this gift, told in its announcement row. */
  notice?: string;
}

export function ItemView({ slug, item, holdDurationDays, payment, heldUnits, chippedInMinor, draft, onChipInClosed, notice }: ItemViewProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'hold' | 'buy'>('hold');
  const [chipInOpen, setChipInOpen] = useState(Boolean(draft));
  const [thanks, setThanks] = useState('');
  // A notice is newer than any thanks, which it may contradict (an undone buy), so the thanks goes.
  const [shownNotice, setShownNotice] = useState(notice);
  if (notice !== shownNotice) {
    setShownNotice(notice);
    if (notice) setThanks('');
  }
  const chipInButton = useRef<HTMLButtonElement>(null);
  // The Chip in button outlives the dialog, so focus goes back to it either way.
  const chipInClosed = useRef(false);
  useEffect(() => {
    if (chipInOpen || !chipInClosed.current) return;
    chipInClosed.current = false;
    chipInButton.current?.focus();
  }, [chipInOpen]);
  function closeChipIn() {
    chipInClosed.current = true;
    setChipInOpen(false);
    onChipInClosed?.();
  }
  const hold = useHoldItem(slug, item.id);
  const buy = useHoldItem(slug, item.id, 'buy');
  const sheet = dialogMode === 'buy' ? buy : hold;
  const holdButton = useRef<HTMLButtonElement>(null);
  const buyButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // Unmounting the dialog skips the browser's own focus return, and the page
  // is inert until the modal has gone, so move focus after the commit.
  // After a hold or a purchase the button is about to go even if this render still has it.
  const closedBy = useRef<'cancel' | 'done' | null>(null);
  useEffect(() => {
    if (dialogOpen || !closedBy.current) return;
    const button = closedBy.current === 'cancel' ? (dialogMode === 'buy' ? buyButton : holdButton).current : null;
    closedBy.current = null;
    if (button) button.focus();
    // The Hold button has gone, so the card's own heading is the nearest place left.
    else heading.current?.focus();
  }, [dialogOpen, dialogMode]);

  function openDialog(mode: 'hold' | 'buy') {
    // Cleared, so a repeat purchase is announced again.
    setThanks('');
    setDialogMode(mode);
    setDialogOpen(true);
  }

  function closeDialog() {
    closedBy.current = 'cancel';
    setDialogOpen(false);
    // The next opening starts clean: no stale error from this one.
    sheet.reset();
  }

  const group = item.type === 'group' && item.priceMinor !== null
    ? { price: item.priceMinor, pledged: item.pledgedMinor ?? 0 }
    : null;

  // Status comes from the server alone. useHoldItem stays pending until the
  // refetched list view lands, and a remembered local success would go stale
  // the moment the guest releases or buys from "Your contributions".
  return (
    <div className="space-y-4">
      <h2 ref={heading} id={`item-title-${item.id}`} tabIndex={-1} className="font-display text-[1.3rem] leading-tight text-balance break-words">{item.title}</h2>
      {item.priceMinor !== null && <p className="font-bold tabular-nums">{formatMoney(item.priceMinor)}</p>}
      {item.description && <ClampedText id={`item-description-${item.id}`}><Markdown text={item.description} /></ClampedText>}
      {item.url && <p><a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-block py-2.5 text-moss underline">View on {storeHost(item.url)} <span className="sr-only">for {item.title} (opens in a new tab)</span></a></p>}
      {item.type === 'single' && item.status === 'available' && item.availableUnits > 1 && <p>Wanted: {item.availableUnits} more</p>}
      {/* Mounted while available too: screen readers miss a live region that arrives already filled.
          While it's empty, the row adds no gap of its own. */}
      <div className="flex items-center gap-2.5 has-[>p:empty:only-child]:mb-0">
        {item.status !== 'available' && <Seal tone={item.status === 'purchased' ? 'gold-wax' : 'red-wax'} />}
        <ItemAnnouncement message={thanks || notice || (item.status === 'available' ? '' : item.status === 'held' ? `${item.title} is held.` : `${item.title} has been purchased.`)} />
      </div>
      {/* Mounted on every single gift, so a hold that leaves units free is still announced. */}
      {item.type === 'single' && <p aria-live="polite" className="empty:mb-0">{heldUnits > 0 ? `You're holding ${heldUnits}` : ''}</p>}
      {group && (
        <>
          <PledgeProgress pledgedMinor={group.pledged} priceMinor={group.price} />
          {chippedInMinor > 0 && <p>You chipped in {formatMoney(chippedInMinor)}</p>}
          <button ref={chipInButton} type="button" onClick={() => { setThanks(''); setChipInOpen(true); }} className="btn-primary">
            Chip in
          </button>
        </>
      )}
      {chipInOpen && group && (
        <ContributeDialog
          slug={slug}
          itemId={item.id}
          itemTitle={item.title}
          remainingMinor={Math.max(group.price - group.pledged, 0)}
          payment={payment}
          onPledged={(amountMinor) => { setThanks(`Thank you! Your pledge of ${formatMoney(amountMinor)} is recorded.`); closeChipIn(); }}
          onClose={closeChipIn}
          draft={draft}
        />
      )}
      {item.type === 'single' && item.status === 'available' && (
        <div className="flex flex-wrap gap-2">
          <button ref={buyButton} type="button" onClick={() => openDialog('buy')} className="btn-primary">
            I&rsquo;m buying this<span className="sr-only">: {item.title}</span>
          </button>
          <button ref={holdButton} type="button" onClick={() => openDialog('hold')} className="btn-secondary">
            Hold this item<span className="sr-only">: {item.title}</span>
          </button>
        </div>
      )}
      {dialogOpen && (
        <HoldDialog
          itemTitle={item.title}
          holdDurationDays={holdDurationDays}
          availableUnits={item.availableUnits}
          mode={dialogMode}
          isPending={sheet.isPending}
          error={sheet.error}
          onConfirm={(credential, details) => sheet.mutate({ idempotencyKey: credential.idempotencyKey, ...details }, {
            onSuccess: (view) => {
              if (dialogMode === 'buy') setThanks(purchasedMessage(item.title, view.units, view.purchasedUnits));
              closedBy.current = 'done';
              setDialogOpen(false);
            },
          })}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}
