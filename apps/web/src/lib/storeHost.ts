/** The site a store link goes to; Item only stores parseable https URLs, so there is no fallback. */
export function storeHost(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '');
}
