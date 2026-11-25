import { z } from 'zod';
import { MAX_PRICE_PEN, PAGE_LIMIT_DEFAULT, PAGE_LIMIT_MAX } from './limits';

export const Id = z.uuid();
export type Id = z.infer<typeof Id>;

// Arroba inicial opcional de un handle. Acepta: "@sofi" → quita "@"; no toca "sofi@x".
// Probar: https://regex101.com/?regex=%5E%40&testString=%40sofi.cocina&flavor=javascript
const LEADING_AT = /^@/;

// Handle de Instagram: 1–30 caracteres entre minúsculas, dígitos, "." y "_".
// Acepta "sofi.cocina_demo"; rechaza "Sofi Cocina" (mayúscula y espacio) y "a".repeat(31).
// Probar: https://regex101.com/?regex=%5E%5Ba-z0-9._%5D%7B1%2C30%7D%24&testString=sofi.cocina_demo&flavor=javascript
export const IG_HANDLE_REGEX = /^[a-z0-9._]{1,30}$/;

// Ruta local servida por el frontend (imágenes de perfiles ficticios). Acepta "/fixtures/profiles/sofi.moda.demo.webp";
// rechaza "fixtures/x.webp" (sin "/" inicial), "//cdn.com/x.webp" (protocolo relativo) y "/a/../b" (segmento "..").
// Probar: https://regex101.com/?regex=%5E%5C%2F(%3F!%5C%2F)(%3F!.*%5C.%5C.)%5B%5Cw.%5C%2F-%5D%2B%24&testString=%2Ffixtures%2Fprofiles%2Fsofi.moda.demo.webp&flavor=javascript
const ROOT_RELATIVE_PATH = /^\/(?!\/)(?!.*\.\.)[\w./-]+$/;

/** Imagen de perfil: URL absoluta (Storage) o ruta local del frontend (fixtures). */
export const ImageUrl = z.union([z.url(), z.string().regex(ROOT_RELATIVE_PATH)]);

export const IsoDate = z.iso.datetime({ offset: true });

/** Handle de Instagram normalizado: minúsculas, sin "@". */
export const IgHandle = z
  .string()
  .trim()
  .transform((s) => s.replace(LEADING_AT, '').toLowerCase())
  .pipe(z.string().regex(IG_HANDLE_REGEX, 'Handle de Instagram inválido'));
export type IgHandle = z.infer<typeof IgHandle>;

export const PricePen = z.number().int().nonnegative().max(MAX_PRICE_PEN);

export const ErrorCode = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INVALID_TRANSITION',
  'UPSTREAM_ERROR',
  'INTERNAL_ERROR',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorBody = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

export const PageQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
});

export const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });
