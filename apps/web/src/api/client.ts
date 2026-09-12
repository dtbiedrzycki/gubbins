import {
  createListRequestSchema, createListResponseSchema, enterGuestKeyRequestSchema, enterGuestKeyResponseSchema,
  holdItemRequestSchema, holdItemResponseSchema, listViewResponseSchema,
  type CreateListRequest, type CreateListResponse, type EnterGuestKeyRequest, type EnterGuestKeyResponse,
  type HoldItemRequest, type HoldItemResponse, type ListViewResponse,
} from '@gubbins/shared-types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<TResponse>(
  path: string,
  init: RequestInit,
  responseSchema: { parse: (data: unknown) => TResponse },
): Promise<TResponse> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}) as { message?: string });
    throw new ApiError(response.status, body.message ?? 'Request failed');
  }
  return responseSchema.parse(await response.json());
}

export const api = {
  createList: (input: CreateListRequest): Promise<CreateListResponse> =>
    request('/lists', { method: 'POST', body: JSON.stringify(createListRequestSchema.parse(input)) }, createListResponseSchema),

  enterGuestKey: (slug: string, input: EnterGuestKeyRequest): Promise<EnterGuestKeyResponse> =>
    request(
      `/lists/${slug}/session`,
      { method: 'POST', body: JSON.stringify(enterGuestKeyRequestSchema.parse(input)) },
      enterGuestKeyResponseSchema,
    ),

  getListView: (slug: string): Promise<ListViewResponse> =>
    request(`/lists/${slug}`, { method: 'GET' }, listViewResponseSchema),

  holdItem: (slug: string, itemId: string, input: HoldItemRequest): Promise<HoldItemResponse> =>
    request(
      `/lists/${slug}/items/${itemId}/hold`,
      { method: 'POST', body: JSON.stringify(holdItemRequestSchema.parse(input)) },
      holdItemResponseSchema,
    ),
};
