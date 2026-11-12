import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <main className="mx-auto w-full max-w-prose flex-1 space-y-5 p-6 pt-12">
      <h1 className="text-4xl font-semibold">There’s nothing at this address.</h1>
      <p>The link may be mistyped or incomplete.</p>
      <Link className="inline-block py-3 text-moss underline" to="/">Go to the home page</Link>
    </main>
  );
}
