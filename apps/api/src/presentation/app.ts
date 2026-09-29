import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import path from 'node:path';
import { ZodError } from 'zod';
import {
  hasZodFastifySchemaValidationErrors, isResponseSerializationError,
  jsonSchemaTransform, serializerCompiler, validatorCompiler,
} from 'fastify-type-provider-zod';
import { errorResponseSchema } from '@gubbins/shared-types';
import type { AppDependencies } from './compositionRoot.js';
import { registerRoutes } from './routes.js';
import { appVersion } from './appVersion.js';

export interface BuildAppOptions {
  cookieSecret: string;
  /** Directory to serve as static files (the built apps/web bundle). Omit to skip static serving — used by Task 11's own integration tests, which only exercise /api routes. */
  webDist?: string;
}

export function buildApp(deps: AppDependencies, options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(cookie, { secret: options.cookieSecret });
  // The OpenAPI document (apps/api/openapi.json, ADR-0077) is generated from
  // the route schemas. Swagger collects routes through an onRoute hook, so it
  // must be registered before them — the routes go in a plugin queued after it,
  // which keeps buildApp synchronous.
  app.register(swagger, {
    openapi: { info: { title: 'gubbins', version: appVersion } },
    transform: jsonSchemaTransform,
  });
  app.register(async (instance) => registerRoutes(instance, deps));

  if (options.webDist) {
    const webDist = path.resolve(options.webDist);
    app.register(fastifyStatic, { root: webDist, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.method === 'GET' && !request.url.startsWith('/api/')) {
        reply.sendFile('index.html', webDist);
      } else {
        reply.code(404).send({ message: 'Not found' });
      }
    });
  }

  app.setErrorHandler<Error>((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      // The provider does not expose zod's issue objects; rebuild the same
      // { code, path, message } shape the pre-OpenAPI handler returned.
      const issues = error.validation.map((v) => ({ code: v.keyword, path: v.instancePath.split('/').slice(1), message: v.message }));
      reply.code(400).send(errorResponseSchema.parse({ message: 'Invalid request', issues }));
      return;
    }
    if (error instanceof ZodError) {
      reply.code(400).send(errorResponseSchema.parse({ message: 'Invalid request', issues: error.issues }));
      return;
    }
    // A handler built a body its own response schema rejects: a server bug,
    // never the client's fault.
    const event = isResponseSerializationError(error) ? 'response_schema_mismatch' : 'unhandled_error';
    // Fastify's own `logger: false` above means nothing else in this process
    // logs unhandled errors — without this, a real failure (e.g. a
    // constraint violation, a bad migration) would produce a 500 with no
    // trace anywhere, stdout included.
    deps.logger.logError(event, { message: error.message, stack: error.stack, url: request.url });
    reply.code(500).send(errorResponseSchema.parse({ message: 'Internal server error' }));
  });

  return app;
}
