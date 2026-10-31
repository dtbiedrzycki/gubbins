import createClient from 'openapi-fetch';
import type {
  AddItemRequest, AddItemResponse, CreateListRequest, CreateListResponse, EditedResponse, EditItemRequest, EditListDetailsRequest, EnterGuestKeyRequest, EnterGuestKeyResponse,
  GuestKeySuggestionResponse, HoldItemRequest, HoldItemResponse, HoldView, ListViewResponse, ManageViewResponse, OwnerSessionRequest, OwnerSessionResponse, PledgeRequest, PledgeResponse,
} from '@gubbins/shared-types';
import type { paths } from './schema.gen';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The server's machine-readable reason for a 409 (`item_unavailable`, `hold_not_active`, …), when it sent one. */
    readonly code?: string,
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
//
// fetch rejects only when no response arrived at all, with browser-specific
// text ("Failed to fetch", "NetworkError when…"); status 0 marks that case.
const http = createClient<paths>({
  baseUrl: globalThis.location.origin,
  credentials: 'same-origin',
  fetch: (request) => globalThis.fetch(request).catch(() => {
    throw new ApiError(0, "Couldn't reach the server. Check your connection and try again.");
  }),
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
    const body = typeof error === 'object' && error !== null ? (error as { message?: unknown; code?: unknown }) : {};
    const message = typeof body.message === 'string' ? body.message : 'Request failed';
    const code = typeof body.code === 'string' ? body.code : undefined;
    throw new ApiError(response.status, message, code);
  }
  return data;
}

export const api = {
  getInstance: () => http.GET('/api/instance').then(unwrap),

  createList: (input: CreateListRequest): Promise<CreateListResponse> =>
    http.POST('/api/lists', { body: input }).then(unwrap),

  suggestGuestKey: (): Promise<GuestKeySuggestionResponse> =>
    http.GET('/api/guest-key-suggestion').then(unwrap),

  enterGuestKey: (slug: string, input: EnterGuestKeyRequest): Promise<EnterGuestKeyResponse> =>
    http.POST('/api/lists/{slug}/session', { params: { path: { slug } }, body: input }).then(unwrap),

  enterOwnerToken: (slug: string, input: OwnerSessionRequest): Promise<OwnerSessionResponse> =>
    http.POST('/api/lists/{slug}/owner-session', { params: { path: { slug } }, body: input }).then(unwrap),

  addItem: (slug: string, input: AddItemRequest): Promise<AddItemResponse> =>
    http.POST('/api/lists/{slug}/items', { params: { path: { slug } }, body: input }).then(unwrap),

  editItem: (slug: string, itemId: string, input: EditItemRequest): Promise<EditedResponse> =>
    http.PUT('/api/lists/{slug}/items/{itemId}', { params: { path: { slug, itemId } }, body: input }).then(unwrap),

  editListDetails: (slug: string, input: EditListDetailsRequest): Promise<EditedResponse> =>
    http.PUT('/api/lists/{slug}', { params: { path: { slug } }, body: input }).then(unwrap),

  getListView: (slug: string): Promise<ListViewResponse> =>
    http.GET('/api/lists/{slug}', { params: { path: { slug } } }).then(unwrap),

  getManageView: (slug: string): Promise<ManageViewResponse> =>
    http.GET('/api/lists/{slug}/manage', { params: { path: { slug } } }).then(unwrap),

  holdItem: (slug: string, itemId: string, input: HoldItemRequest): Promise<HoldItemResponse> =>
    http.POST('/api/lists/{slug}/items/{itemId}/hold', { params: { path: { slug, itemId } }, body: input }).then(unwrap),

  pledgeContribution: (slug: string, itemId: string, input: PledgeRequest): Promise<PledgeResponse> =>
    http.POST('/api/lists/{slug}/items/{itemId}/contributions', { params: { path: { slug, itemId } }, body: input }).then(unwrap),

  // No body: the session cookie is the credential for now. openapi-fetch
  // sets no Content-Type when there is no body, which Fastify requires.
  extendHold: (slug: string, holdId: string): Promise<HoldView> =>
    http.POST('/api/lists/{slug}/holds/{holdId}/extend', { params: { path: { slug, holdId } } }).then(unwrap),

  releaseHold: (slug: string, holdId: string): Promise<HoldView> =>
    http.POST('/api/lists/{slug}/holds/{holdId}/release', { params: { path: { slug, holdId } } }).then(unwrap),

  markHoldPurchased: (slug: string, holdId: string): Promise<HoldView> =>
    http.POST('/api/lists/{slug}/holds/{holdId}/purchase', { params: { path: { slug, holdId } } }).then(unwrap),
};
