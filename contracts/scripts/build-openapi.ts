// Genera contracts/openapi.json desde el registro `api` (zod es la fuente de verdad, ADR-004).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { api, type Endpoint } from '../src/api';
import { ErrorBody } from '../src/schemas/common';

// Parámetros de ruta Express. Acepta ":claimId" en "/claims/:claimId/verify"; rechaza "claimId" sin ":".
// Probar: https://regex101.com/?regex=%3A(%5Cw%2B)&testString=%2Fclaims%2F%3AclaimId%2Fverify&flavor=javascript
const PATH_PARAM = /:(\w+)/g;
const JSON_INDENT = 2;

type JsonObject = { properties?: Record<string, unknown>; required?: string[] };

const toSchema = (s: z.ZodType, io: 'input' | 'output') =>
  z.toJSONSchema(s, { io, unrepresentable: 'any', target: 'openapi-3.0' });

const json = (schema: unknown) => ({ 'application/json': { schema } });

const pathParams = (path: string) =>
  [...path.matchAll(PATH_PARAM)].map((m) => ({
    name: m[1],
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));

const queryParams = (query: z.ZodType | undefined) => {
  if (!query) return [];
  const q = toSchema(query, 'input') as JsonObject;
  return Object.entries(q.properties ?? {}).map(([name, schema]) => ({
    name,
    in: 'query',
    required: q.required?.includes(name) ?? false,
    schema,
  }));
};

const operation = (name: string, e: Endpoint) => ({
  operationId: name,
  summary: e.summary,
  security: e.auth === false ? [] : [{ bearer: [] }],
  parameters: [...pathParams(e.path), ...queryParams(e.query)],
  ...(e.body && { requestBody: { required: true, content: json(toSchema(e.body, 'input')) } }),
  responses: {
    '200': { description: 'OK', content: json(toSchema(e.response, 'output')) },
    default: { description: 'Error', content: json(toSchema(ErrorBody, 'output')) },
  },
});

const paths = (Object.entries(api) as [string, Endpoint][]).reduce<
  Record<string, Record<string, unknown>>
>((acc, [name, e]) => {
  const path = e.path.replace(PATH_PARAM, '{$1}');
  return { ...acc, [path]: { ...acc[path], [e.method]: operation(name, e) } };
}, {});

const doc = {
  openapi: '3.0.3',
  info: { title: 'Sponcer core API', version: '0.1.0' },
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
  },
  paths,
};

const out = fileURLToPath(new URL('../openapi.json', import.meta.url));
writeFileSync(out, JSON.stringify(doc, null, JSON_INDENT) + '\n');
console.log(`openapi.json: ${Object.keys(api).length} endpoints`);
