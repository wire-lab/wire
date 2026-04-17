import { Subway } from '../subway.ts';
import { type HttpMethod, OpenApiRoute, type OpenApiRouteMeta } from './route.ts';

type OpenAPIServer = { url: string; description?: string };

type OpenAPITag = { name: string; description?: string };

type OpenAPIOperation = {
  summary?: string;
  description?: string;
  tags?: string[];
  operationId?: string;
  parameters?: unknown[];
  requestBody?: unknown;
  responses: Record<string, unknown>;
  deprecated?: boolean;
  security?: unknown[];
  callbacks?: Record<string, unknown>;
  externalDocs?: unknown;
};

type OpenAPIDocument = {
  openapi: '3.0.3';
  info: { title: string; version: string; description?: string };
  servers?: OpenAPIServer[];
  paths: Record<string, Partial<Record<HttpMethod, OpenAPIOperation>>>;
  components?: Record<string, unknown>;
  tags?: OpenAPITag[];
  externalDocs?: unknown;
};

const HTTP_METHODS: readonly HttpMethod[] = [
  'get',
  'post',
  'put',
  'delete',
  'patch',
  'options',
  'head',
  'trace',
] as const;

const is_http_method = (v: string | undefined): v is HttpMethod =>
  v !== undefined && (HTTP_METHODS as readonly string[]).includes(v);

const derive_from_action = (action: string | undefined): { path?: string; method?: HttpMethod } => {
  if (!action) return { path: '/', method: 'get' };
  const segments = action.split('.').filter(Boolean);
  if (segments.length === 0) return { path: '/', method: 'get' };

  const last = segments[segments.length - 1]?.toLowerCase();
  const method = is_http_method(last) ? last : 'get';
  const pathSegments = is_http_method(last) ? segments.slice(0, -1) : segments;
  const path = '/' + (pathSegments.length ? pathSegments.join('/') : '');
  return { path: path === '/' ? '/' : path, method };
};

const to_operation = (meta?: OpenApiRouteMeta): OpenAPIOperation => {
  const responses = meta?.responses ?? { '200': { description: 'OK' } };
  return {
    summary: meta?.summary,
    description: meta?.description,
    tags: meta?.tags,
    operationId: meta?.operationId,
    parameters: meta?.parameters,
    requestBody: meta?.requestBody,
    responses,
    deprecated: meta?.deprecated,
    security: meta?.security,
    callbacks: meta?.callbacks,
    externalDocs: meta?.externalDocs,
  };
};

export const compile_open_api_specification = (
  subway: Subway<OpenApiRoute<unknown, unknown>>,
): OpenAPIDocument => {
  const doc: OpenAPIDocument = {
    openapi: '3.0.3',
    info: { title: 'API', version: '1.0.0' },
    paths: {},
  };

  for (const [action, route] of subway.through()) {
    const meta = route.get_openapi?.();
    const derived = derive_from_action(action as string | undefined);

    const path = meta?.path ?? derived.path;
    const method = meta?.method ?? derived.method;
    if (!path || !method) continue;

    if (!doc.paths[path]) doc.paths[path] = {};
    const operation = to_operation(meta);
    (doc.paths[path] as Record<HttpMethod, OpenAPIOperation>)[method] = operation;
  }

  return doc;
};
