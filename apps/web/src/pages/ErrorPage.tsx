import { useRouteError } from 'react-router-dom';
import { Footer } from '../features/instance/Footer';
import { reloadPage } from './reloadPage';

const RELOAD_GUARD = 'gubbins:chunk-reload';

// Chrome, Firefox and Safari each word a failed dynamic import differently.
const CHUNK_FAILURE = /dynamically imported module|Importing a module script failed/;

// A failed page chunk means this tab predates a deploy: reload once per tab session, then give up.
function reloadOnceForStaleChunk(error: unknown): boolean {
  if (!(error instanceof Error) || !CHUNK_FAILURE.test(error.message)) return false;
  try {
    if (sessionStorage.getItem(RELOAD_GUARD)) return false;
    sessionStorage.setItem(RELOAD_GUARD, '1');
  } catch {
    return false;
  }
  reloadPage();
  return true;
}

export default function ErrorPage() {
  const error = useRouteError();
  if (reloadOnceForStaleChunk(error)) return null;
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <main className="mx-auto w-full max-w-prose flex-1 space-y-5 p-6 pt-12">
        <h1 className="text-4xl font-semibold">Something went wrong.</h1>
        <p>Reloading the page usually fixes it.</p>
        <button type="button" className="min-h-11 rounded bg-moss px-5 text-paper" onClick={reloadPage}>
          Reload
        </button>
      </main>
      <Footer />
    </div>
  );
}
