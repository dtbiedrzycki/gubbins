import type { AppDependencies } from './compositionRoot.js';
import { buildApp } from './app.js';

/**
 * Registering routes needs their schemas, not their dependencies, and
 * generation never sends a request. So each dependency is a stand-in that
 * throws if a handler ever reaches it, and no database is opened.
 */
function unusedDependency(name: string): never {
  return new Proxy({}, {
    get() { throw new Error(`${name} is not available while generating the OpenAPI document`); },
  }) as never;
}

const silentLogger: AppDependencies['logger'] = { logInfo: () => {}, logWarn: () => {}, logError: () => {} };

// Any dependency name resolves to a stand-in, so a new use case needs no edit here.
const noDependencies = new Proxy({} as AppDependencies, {
  get(_, name) { return name === 'logger' ? silentLogger : unusedDependency(String(name)); },
});

/**
 * The API contract (ADR-0077): the OpenAPI document @fastify/swagger derives
 * from the route schemas, pretty-printed with a trailing newline so the
 * committed file diffs cleanly. Never listens on a port.
 */
export async function generateOpenApiDocument(): Promise<string> {
  const app = buildApp(noDependencies, { cookieSecret: 'openapi-generation-only' });
  try {
    await app.ready();
    return JSON.stringify(app.swagger(), null, 2) + '\n';
  } finally {
    await app.close();
  }
}
