// Reglas de dependencia de ADR-005 / backend-hexagonal.md. Se ejecuta con `npm run lint:deps` (cwd = backend/).
// Los nombres de las reglas son los de la tabla `forbidden` del ADR-005.

const SLICE = '^src/modules/[^/]+';
// Paquetes npm que el dominio sí puede importar (los contratos compartidos y zod).
const DOMAIN_ALLOWED_NPM = '(^|/)node_modules/(@sponcer/contracts|zod)(/|$)';
const NPM_TYPES = [
  'npm',
  'npm-dev',
  'npm-optional',
  'npm-peer',
  'npm-bundled',
  'npm-no-pkg',
  'npm-unknown',
];

/** @type {import('dependency-cruiser').IConfiguration} */
// eslint-disable-next-line no-undef -- CommonJS: la config de dependency-cruiser es .cjs
module.exports = {
  forbidden: [
    {
      name: 'domain-puro',
      comment:
        'modules/*/domain solo importa TS puro: ni application, ni infrastructure, ni express, ni @supabase/*, ' +
        'ni ningún paquete npm salvo @sponcer/contracts y zod.',
      severity: 'error',
      from: { path: `${SLICE}/domain/` },
      to: {
        path: [
          `${SLICE}/(application|infrastructure)/`,
          '(^|/)node_modules/(express|@supabase)(/|$)',
        ],
      },
    },
    {
      name: 'domain-puro-npm',
      comment: 'domain no depende de paquetes npm distintos de @sponcer/contracts y zod.',
      severity: 'error',
      from: { path: `${SLICE}/domain/` },
      to: { dependencyTypes: NPM_TYPES, pathNot: DOMAIN_ALLOWED_NPM },
    },
    {
      name: 'domain-sin-node-core',
      comment:
        'Aviso: un domain "TS puro" tampoco debería usar módulos de Node (node:crypto...). ' +
        'El ADR-005 solo prohíbe paquetes npm, por eso es warn y no bloquea el PR.',
      severity: 'warn',
      from: { path: `${SLICE}/domain/` },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'application-sin-infra',
      comment: 'modules/*/application no importa infrastructure, express ni @supabase/*.',
      severity: 'error',
      from: { path: `${SLICE}/application/` },
      to: {
        path: [`${SLICE}/infrastructure/`, '(^|/)node_modules/(express|@supabase)(/|$)'],
      },
    },
    {
      name: 'slices-por-index',
      comment: 'Un slice solo importa de otro slice su index.ts (API pública); nunca sus entrañas.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/[^/]+/',
        pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'shared-sin-negocio',
      comment: 'shared/ no conoce a ningún slice.',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'sin-ciclos',
      comment: 'Sin dependencias circulares (incluye imports de solo tipos).',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'sin-imports-irresolubles',
      comment: 'Un import que no se resuelve esconde violaciones: se trata como error.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: '(^|/)node_modules/' },
    // Los tests no forman parte del grafo de producción (los de tests/ ni se escanean: el script cruza `src`).
    exclude: { path: '\\.(test|spec)\\.ts$' },
    // Cuenta también `import type`: es como se acoplan los slices vía puertos.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      extensions: ['.ts', '.js', '.json'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
