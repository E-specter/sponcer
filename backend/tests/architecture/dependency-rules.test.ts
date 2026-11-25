import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Prueba las reglas de .dependency-cruiser.cjs con un árbol `src/` falso que las viola a propósito.
 * Si una regla se rompiera en silencio (p. ej. un regex que no casa), `lint:deps` pasaría en verde
 * sin proteger nada: aquí se demuestra que cada regla detecta su violación.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND = resolve(HERE, '..', '..');
const CRUISER_BIN = resolve(
  BACKEND,
  '..',
  'node_modules',
  'dependency-cruiser',
  'bin',
  'dependency-cruiser.mjs',
);
const CONFIG = join(BACKEND, '.dependency-cruiser.cjs');
const TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 52_428_800;

interface Violation {
  rule: { name: string; severity: string };
  from: string;
  to: string;
}

// Rutas relativas a la raíz del árbol falso. Cada archivo es válido salvo por el import marcado.
const FILES: Record<string, string> = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      module: 'preserve',
      moduleResolution: 'bundler',
      target: 'ES2023',
      strict: true,
    },
  }),
  // domain-puro: application, infrastructure, express, @supabase/*, npm ajeno; zod y contracts permitidos
  'src/modules/a/domain/bad-infra.ts': "export { run } from '../infrastructure/adapter';\n",
  'src/modules/a/domain/bad-app.ts': "export { uc } from '../application/uc';\n",
  'src/modules/a/domain/bad-express.ts': "export { default as e } from 'express';\n",
  'src/modules/a/domain/bad-supabase.ts': "export { createClient } from '@supabase/supabase-js';\n",
  'src/modules/a/domain/bad-npm.ts': "export { default as cors } from 'cors';\n",
  'src/modules/a/domain/ok-zod.ts':
    "export { z } from 'zod';\nexport { api } from '@sponcer/contracts';\n",
  'src/modules/a/domain/warn-core.ts': "export { randomUUID } from 'node:crypto';\n",
  // application-sin-infra
  'src/modules/a/application/uc.ts': 'export const uc = 1;\n',
  'src/modules/a/application/bad-infra.ts': "export { run } from '../infrastructure/adapter';\n",
  'src/modules/a/application/bad-express.ts': "export { Router } from 'express';\n",
  'src/modules/a/application/ok-domain.ts': "export { z } from '../domain/ok-zod';\n",
  'src/modules/a/infrastructure/adapter.ts': 'export const run = 1;\n',
  // slices-por-index
  'src/modules/b/index.ts': 'export const publicApi = 1;\n',
  'src/modules/b/domain/secret.ts': 'export const secret = 1;\n',
  'src/modules/a/application/bad-deep.ts': "export { secret } from '../../b/domain/secret';\n",
  'src/modules/a/application/ok-index.ts': "export { publicApi } from '../../b';\n",
  // shared-sin-negocio
  'src/shared/bad-business.ts': "export { publicApi } from '../modules/b';\n",
  // sin-ciclos (el segundo enlace es `import type`, que también cuenta)
  'src/shared/cycle-1.ts': "import { two } from './cycle-2';\nexport const one = () => two;\n",
  'src/shared/cycle-2.ts':
    "import type { one } from './cycle-1';\nexport const two = (x?: typeof one) => x;\n",
  // import roto
  'src/shared/bad-missing.ts': "export { nada } from './no-existe';\n",
};

let root = '';
let violations: Violation[] = [];

const hit = (rule: string, from: string, to: string) =>
  violations.some((v) => v.rule.name === rule && v.from === `src/${from}` && v.to.includes(to));
const of = (from: string) => violations.filter((v) => v.from === `src/${from}`);

beforeAll(() => {
  root = mkdtempSync(join(HERE, '.fixture-'));
  Object.entries(FILES).forEach(([path, content]) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  });
  const run = spawnSync(
    process.execPath,
    [CRUISER_BIN, 'src', '--config', CONFIG, '--output-type', 'json'],
    { cwd: root, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES },
  );
  violations = JSON.parse(run.stdout).summary.violations;
}, TIMEOUT_MS);

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('reglas de dependency-cruiser (ADR-005)', () => {
  it('domain-puro: prohíbe application e infrastructure', () => {
    expect(
      hit('domain-puro', 'modules/a/domain/bad-infra.ts', 'modules/a/infrastructure/adapter.ts'),
    ).toBe(true);
    expect(hit('domain-puro', 'modules/a/domain/bad-app.ts', 'modules/a/application/uc.ts')).toBe(
      true,
    );
  });

  it('domain-puro: prohíbe express y @supabase/*', () => {
    expect(hit('domain-puro', 'modules/a/domain/bad-express.ts', 'node_modules/express')).toBe(
      true,
    );
    expect(hit('domain-puro', 'modules/a/domain/bad-supabase.ts', '@supabase/supabase-js')).toBe(
      true,
    );
  });

  it('domain-puro-npm: prohíbe cualquier otro paquete npm, pero permite zod y contracts', () => {
    expect(hit('domain-puro-npm', 'modules/a/domain/bad-npm.ts', 'node_modules/cors')).toBe(true);
    expect(of('modules/a/domain/ok-zod.ts')).toEqual([]);
  });

  it('domain-sin-node-core: avisa (no bloquea) del uso de módulos de Node en domain', () => {
    expect(of('modules/a/domain/warn-core.ts').map((v) => v.rule)).toEqual([
      { name: 'domain-sin-node-core', severity: 'warn' },
    ]);
  });

  it('application-sin-infra: prohíbe infrastructure y express; permite domain', () => {
    expect(
      hit(
        'application-sin-infra',
        'modules/a/application/bad-infra.ts',
        'modules/a/infrastructure/adapter.ts',
      ),
    ).toBe(true);
    expect(
      hit('application-sin-infra', 'modules/a/application/bad-express.ts', 'node_modules/express'),
    ).toBe(true);
    expect(of('modules/a/application/ok-domain.ts')).toEqual([]);
  });

  it('slices-por-index: solo se importa el index.ts de otro slice', () => {
    expect(
      hit('slices-por-index', 'modules/a/application/bad-deep.ts', 'modules/b/domain/secret.ts'),
    ).toBe(true);
    expect(of('modules/a/application/ok-index.ts')).toEqual([]);
  });

  it('shared-sin-negocio: shared no importa modules', () => {
    expect(hit('shared-sin-negocio', 'shared/bad-business.ts', 'modules/b/index.ts')).toBe(true);
  });

  it('sin-ciclos: detecta ciclos, también los de import type', () => {
    expect(
      violations.some(
        (v) => v.rule.name === 'sin-ciclos' && v.from.startsWith('src/shared/cycle-'),
      ),
    ).toBe(true);
  });

  it('sin-imports-irresolubles: un import roto es un error, no un hueco', () => {
    expect(hit('sin-imports-irresolubles', 'shared/bad-missing.ts', 'no-existe')).toBe(true);
  });
});
