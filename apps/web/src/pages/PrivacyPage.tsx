import { useInstance } from '../features/instance/useInstance';

// Each statement below is true of the code today; keep it that way when behaviour changes.
export default function PrivacyPage() {
  const { data } = useInstance();
  return (
    <main className="mx-auto w-full max-w-prose flex-1 space-y-5 p-6 pt-12 text-ink">
      <h1 className="text-4xl font-semibold">Privacy</h1>
      <p>Gubbins is a small wishlist app. It does not track people and it serves no ads.</p>

      <section className="space-y-2">
        <h2 className="text-2xl font-semibold">What guests give us</h2>
        <p>
          When you hold a gift or chip in, you enter a name and, if you like, a message. We also keep the
          amounts you pledge. We do not ask for your email address.
        </p>
        <p>Other guests never see your name or message. They are kept for the person who owns the list.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xl font-semibold">Cookies</h2>
        <p>
          Gubbins sets one cookie, and only because the site cannot work without it. For guests it remembers
          which gifts you hold and lasts 30 days. For a list owner it keeps you signed in and ends when you
          close your browser.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xl font-semibold">No tracking, no ads</h2>
        <p>
          There are no profiles of guests, no third-party trackers or scripts, and no ads. The fonts are served
          from this site, so your browser does not contact anyone else to show a page.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xl font-semibold">Keeping and deleting data</h2>
        <p>
          Nothing is deleted automatically yet. To ask about your data or have it removed,{' '}
          {data?.privacyContact
            ? <>contact <strong>{data.privacyContact}</strong>.</>
            : 'contact whoever runs this site.'}
        </p>
      </section>
    </main>
  );
}
