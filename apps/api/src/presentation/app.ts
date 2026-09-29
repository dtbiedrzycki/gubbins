import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { ZodError } from 'zod';
import { errorResponseSchema } from '@gubbins/shared-types';
import type { AppDependencies } from './compositionRoot.js';
import { registerRoutes } from './routes.js';

export interface BuildAppOptions {
  cookieSecret: string;
  /** Directory to serve as static files (the built apps/web bundle). Omit to skip static serving — used by Task 11's own integration tests, which only exercise /api routes. */
  webDist?: string;
}

export function buildApp(deps: AppDependencies, options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(cookie, { secret: options.cookieSecret });
  registerRoutes(app, deps);

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
    if (error instanceof ZodError) {
      reply.code(400).send(errorResponseSchema.parse({ message: 'Invalid request', issues: error.issues }));
      return;
    }
    // Fastify's own `logger: false` above means nothing else in this process
    // logs unhandled errors — without this, a real failure (e.g. a
    // constraint violation, a bad migration) would produce a 500 with no
    // trace anywhere, stdout included.
    deps.logger.logError('unhandled_error', { message: error.message, stack: error.stack, url: request.url });
    reply.code(500).send(errorResponseSchema.parse({ message: 'Internal server error' }));
  });

  return app;
}
