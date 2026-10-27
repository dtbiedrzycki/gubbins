import { describe, expect, it, vi } from 'vitest';

// Listing the routes needs no data, so generating the document must not open
// (or migrate) a database. Making createDb throw pins that.
vi.mock('../infrastructure/db/createDb.js', () => ({
  createDb: () => { throw new Error('OpenAPI generation must not open a database'); },
}));

const { generateOpenApiDocument } = await import('./openApiDocument.js');

describe('generateOpenApiDocument', () => {
  it('does not open a database', async () => {
    const doc = JSON.parse(await generateOpenApiDocument());
    expect(Object.keys(doc.paths)).toHaveLength(11);
  });
});
