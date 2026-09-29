import { http, HttpResponse, type HttpHandler } from 'msw';
import type { paths } from '../../api/schema.gen';

type Method = 'get' | 'post';
type Operation<P extends keyof paths, M extends Method> = NonNullable<paths[P][M]>;
type Status<P extends keyof paths, M extends Method> =
  Operation<P, M> extends { responses: infer R } ? keyof R & number : never;
type Body<P extends keyof paths, M extends Method, S> =
  Operation<P, M> extends { responses: infer R }
    ? S extends keyof R ? R[S] extends { content: { 'application/json': infer B } } ? B : never : never
    : never;

/**
 * An MSW handler typed by the OpenAPI contract (ADR-0077): the path must be in
 * apps/api/openapi.json, the status must be one that operation documents, and
 * the body must match that status's schema. `{param}` placeholders become
 * MSW's `:param`, so the mock matches any parameter value.
 *
 * S is inferred from `status` alone (`const S extends number`, constrained at
 * the parameter) and `body` is NoInfer — otherwise TypeScript widens S to
 * every documented status and accepts any status's body.
 */
export function mock<P extends keyof paths, M extends Method, const S extends number>(
  method: M, path: P, status: S & Status<P, M>, body: NoInfer<Body<P, M, S>>,
): HttpHandler {
  const mswPath = path.replace(/\{(\w+)\}/g, ':$1');
  return http[method](mswPath, () => HttpResponse.json(body as object, { status }));
}
