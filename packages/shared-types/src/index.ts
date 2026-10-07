/**
 * Wire-format contracts shared by the web app and the API: zod schemas for
 * the shape of each HTTP request and response, and nothing else.
 *
 * These schemas are not where invariants live. A check here (such as a
 * title's length) only rejects a malformed payload early, at the boundary.
 * The rules that define a valid wishlist, item or hold belong to the API's
 * domain layer (`apps/api/src/domain`: entity constructors and value
 * objects). The domain enforces them on every construction path, including
 * rows read back from storage, whether or not a schema here also checks
 * them. When the two overlap, the domain is the authority, so when a rule
 * changes, change it there first.
 */
export * from './createList.js';
export * from './enterGuestKey.js';
export * from './holdItem.js';
export * from './holdView.js';
export * from './listView.js';
export * from './errorResponse.js';
