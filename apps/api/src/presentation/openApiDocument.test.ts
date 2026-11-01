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
      createList: ['201', '400', '403'],
      enterGuestKey: ['200', '400', '404'],
      enterOwnerToken: ['200', '400', '404'],
      getInstance: ['200'],
      suggestGuestKey: ['200'],
      getListView: ['200', '400', '404'],
      editListDetails: ['200', '400', '404'],
      editItem: ['200', '400', '404'],
      addItem: ['201', '400', '404', '409'],
      getManageView: ['200', '400', '404'],
      holdItem: ['201', '400', '404', '409'],
      pledgeContribution: ['201', '400', '404', '409'],
      extendHold: ['200', '400', '404', '409'],
      releaseHold: ['200', '400', '404', '409'],
      markHoldPurchased: ['200', '400', '404', '409'],
    });
  });
  it('describes every response, rather than leaving the generator default', async () => {
    const doc = JSON.parse(await generateOpenApiDocument());
    const descriptions: string[] = [];
    for (const methods of Object.values(doc.paths) as Record<string, { responses: Record<string, { description: string }> }>[]) {
      for (const op of Object.values(methods)) for (const response of Object.values(op.responses)) descriptions.push(response.description);
    }
    expect(descriptions).toHaveLength(47);
    expect(descriptions.filter((d) => !d.trim() || d === 'Default Response')).toEqual([]);
  });

  it('defines the error body once, as a component every error response references', async () => {
    const doc = JSON.parse(await generateOpenApiDocument());
    expect(Object.keys(doc.components.schemas)).toEqual(['ErrorResponse']);
    const errorSchemas: unknown[] = [];
    for (const methods of Object.values(doc.paths) as Record<string, { responses: Record<string, { content: { 'application/json': { schema: unknown } } }> }>[]) {
      for (const op of Object.values(methods)) {
        for (const [status, response] of Object.entries(op.responses)) {
          if (status.startsWith('4')) errorSchemas.push(response.content['application/json'].schema);
        }
      }
    }
    expect(errorSchemas).toHaveLength(32);
    expect(errorSchemas).toEqual(Array(32).fill({ $ref: '#/components/schemas/ErrorResponse' }));
  });
});
