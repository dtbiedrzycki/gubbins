import { Link } from 'react-router-dom';
import { useInstance } from './useInstance';

/** The upstream repository: the source link until (or unless) the server names this instance's own.
 *  Keep in step with the default sourceUrl in apps/api/src/presentation/instanceConfig.ts; this copy keeps the link working when the server can't be reached. */
export const UPSTREAM_SOURCE_URL = 'https://github.com/dtbiedrzycki/gubbins';

export function Footer() {
  const { data } = useInstance();
  return (
    <footer className="mt-auto border-t border-line px-4 pb-7 pt-5 text-center text-sm text-muted">
      Gubbins is free software under the <a className="inline-block py-3 text-moss underline" href="https://www.gnu.org/licenses/agpl-3.0.html">AGPL-3.0</a>
      {' · '}<a className="inline-block py-3 text-moss underline" href={data?.sourceUrl ?? UPSTREAM_SOURCE_URL}>Source on GitHub</a>
      {' · '}<Link className="inline-block py-3 text-moss underline" to="/privacy">Privacy</Link>
    </footer>
  );
}
