import { z } from 'zod';

export const instanceResponseSchema = z.object({
  sourceUrl: z.string(),
  privacyContact: z.string().nullable(),
});

export interface InstanceConfig {
  sourceUrl: string;
  privacyContact: string | null;
}

/** Where an instance points at its source (AGPL-3.0, ADR-0043) until SOURCE_URL says otherwise. */
export const DEFAULT_SOURCE_URL = 'https://github.com/dtbiedrzycki/gubbins';
