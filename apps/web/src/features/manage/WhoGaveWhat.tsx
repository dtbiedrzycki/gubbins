import { actionErrorMessage } from '../../lib/actionErrorMessage';

export interface WhoGaveWhatProps {
  /** The owner has asked to see the details and they loaded. */
  revealed: boolean;
  loading: boolean;
  error: Error | null;
  onShow(): void;
  onHide(): void;
}

/** The control that reveals guests' names and messages for every gift at once (ADR-0089), with its spoiler warning. */
export function WhoGaveWhat({ revealed, loading, error, onShow, onHide }: WhoGaveWhatProps) {
  return (
    <section aria-label="Who gave what" className={`grid gap-2.5 rounded-[14px] border-[1.5px] bg-white p-3.5 ${revealed ? 'border-line' : 'border-dashed border-muted'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* A live region, so screen readers hear the details arrive and go. */}
        <p aria-live="polite" className="font-bold">{revealed ? 'Showing who gave what.' : 'Who gave what is hidden.'}</p>
        {/* aria-disabled, not disabled: a disabled button drops the keyboard focus the owner just put on it. */}
        <button type="button" aria-disabled={loading} onClick={loading ? undefined : revealed ? onHide : onShow} className="btn-secondary btn-sm aria-disabled:opacity-60">
          {loading ? 'Showing…' : revealed ? 'Hide' : 'Show who gave what'}
        </button>
      </div>
      {!revealed && <p className="text-muted">Spoilers: this shows every guest&apos;s name and message, for all gifts.</p>}
      {error && <p role="alert" className="text-error">{actionErrorMessage(error, 'Couldn’t show who gave what.')}</p>}
    </section>
  );
}
