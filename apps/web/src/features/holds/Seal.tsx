export interface SealProps {
  /** Stamp the seal in as it appears; motion-safe, so reduced motion just shows it. */
  stamp?: boolean;
}

/** The wax seal beside a promised or purchased gift. Decorative: the status text beside it says the same. */
export function Seal({ stamp = false }: SealProps) {
  // transform, not -rotate-*: Tailwind's rotate-* sets the separate rotate property, which adds to the
  // stamp keyframes' transform. Keep -8deg equal to the stamp's "to" frame in index.css.
  return (
    <span
      aria-hidden="true"
      data-seal
      className={`grid size-11 flex-none [transform:rotate(-8deg)] place-items-center rounded-full bg-[radial-gradient(circle_at_38%_34%,#C2455F,var(--color-wax)_60%,#6E1830)] font-display text-[1.35rem] leading-none text-petal shadow-[0_0_0_3px_var(--color-wax),3px_2px_0_2px_#8A2340,-2px_3px_0_1px_#8A2340] ${stamp ? 'motion-safe:animate-stamp' : ''}`}
    >
      G
    </span>
  );
}
