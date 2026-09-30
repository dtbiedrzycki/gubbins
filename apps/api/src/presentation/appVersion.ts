import { readFileSync } from 'node:fs';

// The release version, from the root package.json. It is the OpenAPI
// document's info.version, so a client can tell which release a spec
// describes. The path resolves from both src/presentation (tsx) and
// dist/presentation (compiled), which sit at the same depth.
export const appVersion: string = (
  JSON.parse(readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8')) as { version: string }
).version;
