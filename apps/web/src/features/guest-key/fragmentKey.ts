/** Reads an invite link's `#key=…`; `rest` is the fragment without it, to put back in the address bar. */
export function readFragmentKey(hash: string): { key: string | null; rest: string } {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const key = params.get('key');
  params.delete('key');
  const rest = params.toString();
  // URLSearchParams never throws: bad percent-encoding decodes to U+FFFD, which no real key contains.
  return { key: key && !key.includes('�') ? key : null, rest: rest && `#${rest}` };
}
