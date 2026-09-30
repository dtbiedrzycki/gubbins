import createClient from 'openapi-fetch';
import type {
  CreateListRequest, CreateListResponse, EnterGuestKeyRequest, EnterGuestKeyResponse,
  HoldItemRequest, HoldItemResponse, ListViewResponse,
} from '@gubbins/shared-types';
import type { paths } from './schema.gen';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

// Paths, methods, params and bodies are typed by the OpenAPI contract
// (apps/api/openapi.json → schema.gen.ts, ADR-0077). The server validates
// every response against its schema before sending, so the client does not
// re-validate. The base URL is absolute because openapi-fetch builds a
// Request before calling fetch, and Request rejects relative URLs outside a
// browser document (e.g. under vitest).
//
// `fetch` is resolved per call rather than captured at import: openapi-fetch
// defaults to the `globalThis.fetch` of the moment createClient runs, which
// would bypass MSW (and any other later patch of fetch) in tests.
const http = createClient<paths>({
  baseUrl: globalThis.location.origin,
  credentials: 'same-origin',
  fetch: (request) => globalThis.fetch(request),
});

interface FetchResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

function unwrap<T>({ data, error, response }: FetchResult<T>): T {
  if (!response.ok || data === undefined) {
    // openapi-fetch parses an error body as JSON when it can and leaves it as
    // text otherwise (e.g. a reverse proxy's HTML error page).
    const message = typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
      ? error.message
      : 'Request failed';
    throw new ApiError(response.status, message);
  }
  return data;
}

export const api = {
  createList: (input: CreateListRequest): Promise<CreateListResponse> =>
    http.POST('/api/lists', { body: input }).then(unwrap),

  enterGuestKey: (slug: string, input: EnterGuestKeyRequest): Promise<EnterGuestKeyResponse> =>
    http.POST('/api/lists/{slug}/session', { params: { path: { slug } }, body: input }).then(unwrap),

  getListView: (slug: string): Promise<ListViewResponse> =>
    http.GET('/api/lists/{slug}', { params: { path: { slug } } }).then(unwrap),

  holdItem: (slug: string, itemId: string, input: HoldItemRequest): Promise<HoldItemResponse> =>
    http.POST('/api/lists/{slug}/items/{itemId}/hold', { params: { path: { slug, itemId } }, body: input }).then(unwrap),
};
