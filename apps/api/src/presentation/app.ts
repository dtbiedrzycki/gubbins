import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import path from 'node:path';
import { ZodError } from 'zod';
import { $ZodError } from 'zod/v4/core';
import {
  hasZodFastifySchemaValidationErrors, isResponseSerializationError,
  jsonSchemaTransform, jsonSchemaTransformObject, serializerCompiler, validatorCompiler,
} from 'fastify-type-provider-zod';
import { errorResponseSchema } from '@gubbins/shared-types';
import type { AppDependencies } from './compositionRoot.js';
import { registerRoutes } from './routes.js';
import { appVersion } from './appVersion.js';

export interface BuildAppOptions {
  cookieSecret: string;
  /** Directory to serve as static files (the built apps/web bundle). Omit to skip static serving — used by the app's own integration tests, which only exercise /api routes. */
  webDist?: string;
}

// The provider emits an input and an output variant of every registered schema
// ('ErrorResponseInput' and 'ErrorResponse'). The error body is only ever a
// response, so drop the components no operation references. (Path-level $refs
// only: nothing registered nests another registered schema.)
interface DocumentWithComponents {
  paths?: object;
  components?: { schemas?: Record<string, unknown> };
}

const withoutUnusedSchemas: typeof jsonSchemaTransformObject = (document) => {
  const openapi = jsonSchemaTransformObject(document) as DocumentWithComponents;
  const referenced = JSON.stringify(openapi.paths ?? {});
  const schemas = Object.fromEntries(
    Object.entries(openapi.components?.schemas ?? {}).filter(([name]) => referenced.includes(`"#/components/schemas/${name}"`)),
  );
  return { ...openapi, components: { ...openapi.components, schemas } } as ReturnType<typeof jsonSchemaTransformObject>;
};

export function buildApp(deps: AppDependencies, options: BuildAppOptions): FastifyInstance {
  // The schemas cap each text field and this caps the whole request. The largest valid request is a
  // few fields of at most 10,000 characters each, far below 1 MiB. Fastify's default is the same;
  // it is stated here so an upgrade can't change it.
  const app = Fastify({ logger: false, bodyLimit: 1024 * 1024 });
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
    transformObject: withoutUnusedSchemas,
  });
  app.register(async (instance) => registerRoutes(instance, deps));

  // Ops probe, not part of the API contract: hidden from the OpenAPI document.
  app.get('/health', { schema: { hide: true } }, async () => ({ ok: true }));

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
      // instancePath is '/a/b' for a nested issue and '/' for the body itself,
      // which zod reports as []. (Array indices arrive as strings, not numbers.)
      const issues = error.validation.map((v) => ({
        code: v.keyword,
        path: v.instancePath === '/' ? [] : v.instancePath.slice(1).split('/'),
        message: v.message,
      }));
      reply.code(400).send(errorResponseSchema.parse({ message: 'Invalid request', issues }));
      return;
    }
    // Fastify rejects some requests before schema validation runs: malformed
    // JSON, an empty body declared as JSON, an unsupported content type, a body
    // over the size limit. Those are the client's fault, not an unhandled error,
    // so they get the same 400 as a validation failure and no error-log entry.
    if ('code' in error && typeof error.code === 'string' && error.code.startsWith('FST_ERR_CTP_')) {
      reply.code(400).send(errorResponseSchema.parse({ message: 'Invalid request' }));
      return;
    }
    if (error instanceof ZodError) {
      reply.code(400).send(errorResponseSchema.parse({ message: 'Invalid request', issues: error.issues }));
      return;
    }
    // A handler built a body its own response schema rejects: a server bug,
    // never the client's fault.
    const mismatch = isResponseSerializationError(error);
    const event = mismatch ? 'response_schema_mismatch' : 'unhandled_error';
    // The serialization error's own message is fixed text; the zod error in its
    // cause (a core $ZodError, not the classic ZodError) says which field failed. zod's messages name types, not values, so
    // logging them does not echo response data.
    const issues = mismatch && error.cause instanceof $ZodError
      ? error.cause.issues.map(({ code, path, message }) => ({ code, path, message }))
      : undefined;
    // Fastify's own `logger: false` above means nothing else in this process
    // logs unhandled errors — without this, a real failure (e.g. a
    // constraint violation, a bad migration) would produce a 500 with no
    // trace anywhere, stdout included.
    deps.logger.logError(event, { message: error.message, stack: error.stack, url: request.url, ...(issues && { issues }) });
    reply.code(500).send(errorResponseSchema.parse({ message: 'Internal server error' }));
  });

  return app;
}
