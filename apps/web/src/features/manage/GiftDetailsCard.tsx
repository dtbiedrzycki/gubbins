import type { GiftDetailsResponse } from '@gubbins/shared-types';
import { formatDay } from '../../lib/formatDay';
import { formatMoney } from '../../lib/formatMoney';

interface Row { who: string; when: string; message: string | null }

/** A name, with the units only when there's more than one. */
const withUnits = (name: string, units: number) => (units > 1 ? `${name} · ${units}` : name);

/** Who bought, holds and pledged one gift, for thank-you notes and matching payments (ADR-0089). */
export function GiftDetailsCard({ details }: { details: GiftDetailsResponse['items'][number] }) {
  const at = new Date();
  const kinds: [string, Row[]][] = ([
    ['Bought', details.purchases.map((p) => ({ who: withUnits(p.name, p.units), when: formatDay(p.purchasedAt, at), message: p.message }))],
    ['Held', details.holds.map((h) => ({ who: withUnits(h.name, h.units), when: `until ${formatDay(h.expiresAt, at)}`, message: null }))],
    ['Pledged', details.pledges.map((p) => ({ who: `${p.name} · ${formatMoney(p.amountMinor)}`, when: formatDay(p.pledgedAt, at), message: p.message }))],
  ] as [string, Row[]][]).filter(([, rows]) => rows.length > 0);

  return (
    <div className="grid gap-2.5 rounded-xl border border-line bg-white/60 px-3 py-2.5">
      {kinds.length === 0 && <p className="text-[0.92rem] text-muted">No one has held, bought or pledged yet.</p>}
      {kinds.map(([kind, rows]) => (
        <div key={kind} className="grid gap-1.5">
          <p className="text-xs font-bold tracking-wider text-muted uppercase">{kind}</p>
          <ul role="list" className="grid gap-2">
            {rows.map((row, i) => (
              <li key={i} className="grid grid-cols-[1fr_auto] gap-x-2.5">
                <span className="min-w-0 font-bold break-words">{row.who}</span>
                <span className="text-sm text-muted tabular-nums">{row.when}</span>
                {/* React text, never Markdown: a guest's message is shown exactly as typed. */}
                {row.message && <span className="col-span-2 border-l-2 border-petal pl-2.5 font-display italic break-words">{row.message}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
