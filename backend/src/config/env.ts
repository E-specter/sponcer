import { z } from 'zod';

const DEFAULT_PORT = 3000;
const WEIGHTS_COUNT = 4;
const Adapter = z.enum(['mock', 'real']).default('mock');
const Optional = z.string().min(1).optional();

const SLICES = [
  'AUTH',
  'PROFILES',
  'INGESTION',
  'CLASSIFICATION',
  'MATCHING',
  'QUOTES',
  'NOTIFICATIONS',
  'CHAT',
] as const;

const EnvSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    CORS_ORIGIN: z.string().default('http://localhost:4321'),
    SUPABASE_URL: Optional,
    SUPABASE_SERVICE_ROLE_KEY: Optional,
    SUPABASE_ANON_KEY: Optional,
    APIFY_TOKEN: Optional,
    MATCH_WEIGHTS: z
      .string()
      .default('0.5,0.25,0.15,0.1')
      .transform((s) => s.split(',').map(Number))
      .refine(
        (w) => w.length === WEIGHTS_COUNT && w.every(Number.isFinite),
        'MATCH_WEIGHTS: 4 números separados por coma',
      ),
    ADAPTER_AUTH: Adapter,
    ADAPTER_PROFILES: Adapter,
    ADAPTER_INGESTION: Adapter,
    ADAPTER_CLASSIFICATION: Adapter,
    ADAPTER_MATCHING: Adapter,
    ADAPTER_QUOTES: Adapter,
    ADAPTER_NOTIFICATIONS: Adapter,
    ADAPTER_CHAT: Adapter,
  })
  .superRefine((env, ctx) => {
    const anyReal = SLICES.some((s) => env[`ADAPTER_${s}`] === 'real');
    const required = [
      ...(anyReal
        ? (['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'] as const)
        : []),
      ...(env.ADAPTER_INGESTION === 'real' ? (['APIFY_TOKEN'] as const) : []),
    ];
    // Con profiles en mock, los ids no existen en la BD: ningún slice que dependa de ellos puede ir en real.
    if (env.ADAPTER_PROFILES === 'mock') {
      SLICES.filter(
        (s) => s !== 'PROFILES' && s !== 'INGESTION' && env[`ADAPTER_${s}`] === 'real',
      ).forEach((s) =>
        ctx.addIssue({
          code: 'custom',
          path: [`ADAPTER_${s}`],
          message: `ADAPTER_${s}=real requiere ADAPTER_PROFILES=real (los ids del mock no existen en la BD)`,
        }),
      );
    }
    if (env.NODE_ENV === 'production') {
      SLICES.filter((s) => env[`ADAPTER_${s}`] === 'mock').forEach((s) =>
        ctx.addIssue({
          code: 'custom',
          path: [`ADAPTER_${s}`],
          message: `ADAPTER_${s}=mock no se permite con NODE_ENV=production`,
        }),
      );
    }
    required
      .filter((k) => !env[k])
      .forEach((k) =>
        ctx.addIssue({
          code: 'custom',
          path: [k],
          message: `${k} requerida con adaptadores reales`,
        }),
      );
  });

export type Env = z.infer<typeof EnvSchema>;
export type AdapterMode = z.infer<typeof Adapter>;

/** Valida el entorno; las variables vacías (`FOO=`) se tratan como ausentes. */
export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const clean = Object.fromEntries(
    Object.entries(raw).filter(([, v]) => v !== undefined && v !== ''),
  );
  return EnvSchema.parse(clean);
}
