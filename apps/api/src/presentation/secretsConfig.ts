/**
 * Secrets read once at startup. A missing secret stops the server with a
 * message naming the variable, rather than serving an instance anyone can
 * create lists on (ADR-0080) or whose cookies anyone can forge.
 */
export function parseCreateSecret(env: Record<string, string | undefined>): string {
  // Trimmed like the candidate it is compared with, so a pasted newline can't lock everyone out.
  const value = env.CREATE_SECRET?.trim();
  if (!value) throw new Error('CREATE_SECRET must be set: list creation always requires it. Generate one with `openssl rand -base64 32`.');
  return value;
}

/** Null means "use the development fallback", which is allowed only outside production. */
export function parseCookieSecret(env: Record<string, string | undefined>): string | null {
  // Trimmed like CREATE_SECRET, so a value that is only whitespace counts as unset, not as a key anyone can guess.
  const value = env.SESSION_COOKIE_SECRET?.trim();
  if (value) return value;
  if (env.NODE_ENV === 'production') throw new Error('SESSION_COOKIE_SECRET must be set in production. Generate one with `openssl rand -base64 32`.');
  return null;
}
