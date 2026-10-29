export interface SealProps {
  /** Red wax for a held gift, gold wax for a purchased one. */
  tone?: 'red-wax' | 'gold-wax';
  /** Stamp the seal in as it appears; motion-safe, so reduced motion just shows it. */
  stamp?: boolean;
  /** `sm` is the small seal on a filter button. */
  size?: 'md' | 'sm';
}

const toneClasses = {
  'red-wax': 'bg-[radial-gradient(circle_at_38%_34%,#C2455F,var(--color-wax)_60%,#6E1830)] text-petal shadow-[0_0_0_3px_var(--color-wax),3px_2px_0_2px_#8A2340,-2px_3px_0_1px_#8A2340]',
  // Ink, not petal: petal on gold is too faint to read.
  'gold-wax': 'bg-[radial-gradient(circle_at_38%_34%,#F3D27A,var(--color-gold)_60%,#A57E22)] text-ink shadow-[0_0_0_3px_var(--color-gold),3px_2px_0_2px_#A57E22,-2px_3px_0_1px_#A57E22]',
};

const sizeClasses = { md: 'size-11 text-[1.35rem]', sm: 'size-6.5 text-[14px]' };

/** The seal beside a held or purchased gift. Decorative: the status text beside it says the same. */
export function Seal({ tone = 'red-wax', stamp = false, size = 'md' }: SealProps) {
  // transform, not -rotate-*: Tailwind's rotate-* sets the separate rotate property, which adds to the
  // stamp keyframes' transform. Keep -8deg equal to the stamp's "to" frame in index.css.
  return (
    <span
      aria-hidden="true"
      data-seal={tone}
      className={`grid ${sizeClasses[size]} flex-none [transform:rotate(-8deg)] place-items-center rounded-full font-display leading-none ${toneClasses[tone]} ${stamp ? 'motion-safe:animate-stamp' : ''}`}
    >
      G
    </span>
  );
}
