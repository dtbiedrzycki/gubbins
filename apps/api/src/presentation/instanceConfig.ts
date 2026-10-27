import { z } from 'zod';

export const instanceResponseSchema = z.object({
  sourceUrl: z.string(),
  privacyContact: z.string().nullable(),
});

export interface InstanceConfig {
  sourceUrl: string;
  privacyContact: string | null;
}

/** Where an instance points at its source (AGPL-3.0, ADR-0043), with no privacy contact, until configured otherwise. */
export const DEFAULT_INSTANCE_CONFIG: InstanceConfig = {
  sourceUrl: 'https://github.com/dtbiedrzycki/gubbins',
  privacyContact: null,
};
