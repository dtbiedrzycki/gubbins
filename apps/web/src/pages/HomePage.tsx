import { AGPL_URL } from '../lib/links';

const points = [
  <><strong>No tracking.</strong> No accounts, no profiles, and nothing that follows you around the web.</>,
  <><strong>No ads.</strong> Ever.</>,
  <><strong>Self-hostable.</strong> Runs on a Raspberry Pi.</>,
  <><strong>Open source</strong> under the <a className="text-moss underline" href={AGPL_URL}>AGPL v3</a>.</>,
];

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-prose flex-1 space-y-5 p-6 pt-12 text-ink">
      <header className="text-center">
        <h1 className="font-display text-[2.75rem] font-normal">Gubbins</h1>
        <p className="mt-2 text-lg">A wishlist that respects the people using it.</p>
        <span className="vine" aria-hidden="true" />
      </header>
      <p>
        Share a list of gifts you’d love. Guests hold what they’ll buy, so nobody doubles up, and can chip in together
        on bigger gifts.
      </p>
      <ul role="list" className="flex flex-col gap-3">
        {points.map((point, i) => (
          <li key={i} className="flex gap-3">
            <span className="mx-[9px] mt-[7px] size-2.5 flex-none rounded-full bg-moss" aria-hidden="true" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <p className="text-muted">Got an invite? Open the link from it.</p>
    </main>
  );
}
