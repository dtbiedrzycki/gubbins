import { z } from 'zod';

export const instanceResponseSchema = z.object({
  sourceUrl: z.string(),
  privacyContact: z.string().nullable(),
});

export interface InstanceConfig {
  sourceUrl: string;
  privacyContact: string | null;
}

export const DEFAULT_SOURCE_URL = 'https://github.com/dtbiedrzycki/gubbins';

/**
 * SOURCE_URL and PRIVACY_CONTACT (ops), read at startup because the image is
 * built once and configured by env. The source link is how an AGPL-3.0 instance
 * offers its users the code it runs (ADR-0043). A malformed SOURCE_URL stops
 * startup naming the variable; unset or blank means the default, since compose
 * files commonly pass an unset variable through as ''.
 */
export function parseInstanceConfig(env: Record<string, string | undefined>): InstanceConfig {
  const sourceUrl = env.SOURCE_URL?.trim() || DEFAULT_SOURCE_URL;
  if (!isHttpUrl(sourceUrl)) {
    throw new Error(`SOURCE_URL must be an http(s) URL (got ${JSON.stringify(sourceUrl)})`);
  }
  return { sourceUrl, privacyContact: env.PRIVACY_CONTACT?.trim() || null };
}

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
