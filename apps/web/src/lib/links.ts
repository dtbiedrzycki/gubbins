export const AGPL_URL = 'https://www.gnu.org/licenses/agpl-3.0.html';
export const listPath = (slug: string) => `/wishlists/${slug}`;
export const managePath = (slug: string) => `${listPath(slug)}/manage`;
