// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateApiTypes } from '@gubbins/api-typegen';

describe('apps/web/src/api/schema.gen.ts (ADR-0077)', () => {
  it('matches the types generated from the committed apps/api/openapi.json', async () => {
    const spec = readFileSync(new URL('../../../api/openapi.json', import.meta.url), 'utf8');
    const committed = readFileSync(new URL('./schema.gen.ts', import.meta.url), 'utf8');
    expect(await generateApiTypes(spec), 'schema.gen.ts is stale — run `npm run gen:api`').toBe(committed);
  });
});
