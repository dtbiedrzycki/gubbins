import { useInstance } from './useInstance';

/** The upstream repository: the source link until (or unless) the server names this instance's own. */
export const UPSTREAM_SOURCE_URL = 'https://github.com/dtbiedrzycki/gubbins';

export function Footer() {
  const { data } = useInstance();
  return (
    <footer className="mt-auto border-t border-line px-4 pb-7 pt-5 text-center text-sm text-muted">
      Gubbins is free software under the <a href="https://www.gnu.org/licenses/agpl-3.0.html">AGPL-3.0</a>
      {' · '}<a href={data?.sourceUrl ?? UPSTREAM_SOURCE_URL}>Source on GitHub</a>
      {' · '}<a href="/privacy">Privacy</a>
    </footer>
  );
}
