import { useInstance } from '../features/instance/useInstance';

// Each statement below is true of the code today; keep it that way when behaviour changes.
export default function PrivacyPage() {
  const { data } = useInstance();
  return (
    <main className="mx-auto w-full max-w-prose flex-1 space-y-5 p-6 pt-12 text-ink">
      <h1 className="text-4xl font-semibold">Privacy</h1>
      <p>Gubbins is a small wishlist app. It does not track people and it serves no ads.</p>

      <section className="space-y-2">
        <h2 className="text-2xl font-semibold">What guests enter</h2>
        <p>
          When you hold a gift or chip in, you enter a name and, if you like, a message. The amounts
          you pledge are kept too. Gubbins does not ask for your email address.
        </p>
        <p>Other guests never see your name or message. These details are stored on this site’s server.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xl font-semibold">Cookies</h2>
        <p>
          Guests get a cookie when they enter the guest key. It lets you see the list and remembers your holds,
          and it lasts 30 days. List owners get a separate cookie that keeps them signed in until the browser
          closes. Your browser also remembers, on this device only, the gifter names you last gave, whether you
          last chose Venmo or Zelle, and whether you dismissed “How holding a gift works”. None of this leaves your device except the cookies, which
          go only to this site.
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
          Nothing is deleted automatically yet. To ask about your data,{' '}
          {data?.privacyContact
            ? <>contact <strong>{data.privacyContact}</strong>.</>
            : 'contact whoever runs this site.'}
        </p>
      </section>
    </main>
  );
}
