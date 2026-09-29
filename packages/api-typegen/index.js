import openapiTS, { astToString } from 'openapi-typescript';

export const HEADER = '// Generated from apps/api/openapi.json by `npm run gen:api` (ADR-0077). Do not edit.\n\n';

/** Returns the TypeScript source for the given OpenAPI document's JSON text. */
export async function generateApiTypes(specJson) {
  return HEADER + astToString(await openapiTS(specJson));
}
