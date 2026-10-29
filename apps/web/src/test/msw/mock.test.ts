import { describe, expect, it } from 'vitest';
import { server } from './server';
import { mock } from './mock';

describe('mock()', () => {
  it('serves the given status and body at the contract path, matching any parameter value', async () => {
    server.use(mock('post', '/api/lists/{slug}/items/{itemId}/hold', 409, { message: 'Item already held' }));

    const response = await fetch(`${location.origin}/api/lists/any-slug/items/any-item/hold`, { method: 'POST' });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: 'Item already held' });
  });

  it('is checked against the OpenAPI contract at compile time', () => {
    // Each line below must fail to compile. `npm run build` (tsc --noEmit)
    // fails if any of them stops failing, via "Unused '@ts-expect-error'".
    // @ts-expect-error — the path is not in the spec
    mock('post', '/api/lists/{slug}/holds', 201, {});
    // @ts-expect-error — 418 is not a documented status for this operation
    mock('post', '/api/lists/{slug}/items/{itemId}/hold', 418, { message: 'x' });
    // @ts-expect-error — the body does not match the 201 schema
    mock('post', '/api/lists/{slug}/items/{itemId}/hold', 201, { message: 'x' });
    // @ts-expect-error — the route has no GET
    mock('get', '/api/lists', 201, { slug: 's', ownerToken: 'o', key: 'k' });
    // @ts-expect-error — the body is missing required fields of the 201 schema
    mock('post', '/api/lists', 201, { slug: 's' });
    // @ts-expect-error — the body has a property the 201 schema does not define
    mock('post', '/api/lists', 201, { slug: 's', ownerToken: 'o', key: 'k', extra: true });
    expect(true).toBe(true);
  });
});
