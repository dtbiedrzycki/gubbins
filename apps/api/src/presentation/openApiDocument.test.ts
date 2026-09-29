import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateOpenApiDocument } from './openApiDocument.js';

const committedPath = new URL('../../openapi.json', import.meta.url);
const rootPackage = JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8')) as { version: string };

describe('the OpenAPI document (ADR-0077)', () => {
  it('matches the committed apps/api/openapi.json', async () => {
    const generated = await generateOpenApiDocument();
    const committed = readFileSync(committedPath, 'utf8');
    expect(generated, 'apps/api/openapi.json is stale — run `npm run gen:api`').toBe(committed);
  });

  it('carries the release version and title', async () => {
    const doc = JSON.parse(await generateOpenApiDocument());
    expect(doc.info).toEqual({ title: 'gubbins', version: rootPackage.version });
  });

  it('documents exactly the statuses each operation returns', async () => {
    const doc = JSON.parse(await generateOpenApiDocument());
    const statuses: Record<string, string[]> = {};
    for (const methods of Object.values(doc.paths) as Record<string, { operationId: string; responses: object }>[]) {
      for (const op of Object.values(methods)) statuses[op.operationId] = Object.keys(op.responses).sort();
    }
    expect(statuses).toEqual({
      createList: ['201', '400'],
      enterGuestKey: ['200', '400', '404'],
      getListView: ['200', '404'],
      holdItem: ['201', '400', '404', '409'],
    });
  });
});
