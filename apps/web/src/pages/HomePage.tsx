const AGPL = 'https://www.gnu.org/licenses/agpl-3.0.html';

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-prose flex-1 space-y-5 p-6 pt-12 text-ink">
      <header className="text-center">
        <h1 className="text-5xl font-semibold">Gubbins</h1>
        <p className="mt-2 text-lg">A wishlist that respects the people using it.</p>
      </header>
      <p>
        Share a list of gifts you’d love. Guests hold what they’ll buy, so nobody doubles up, and can chip in together
        on bigger gifts.
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li><strong>No tracking.</strong> No accounts, no profiles, and nothing that follows you around the web.</li>
        <li><strong>No ads.</strong> Ever.</li>
        <li><strong>Self-hostable.</strong> Runs on a Raspberry Pi.</li>
        <li>
          <strong>Open source</strong> under the{' '}
          <a className="text-blue-600 underline" href={AGPL}>AGPL v3</a>.
        </li>
      </ul>
      <p className="text-slate-600">Got an invite? Open the link from it.</p>
    </main>
  );
}
