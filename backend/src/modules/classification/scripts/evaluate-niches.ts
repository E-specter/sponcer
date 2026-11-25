// Evalúa e5 real contra los 30 fixtures. Uso: cd backend && npx tsx src/modules/classification/scripts/evaluate-niches.ts
// Solo embedding (sin declarado ni reglas): mide la calidad de la señal vectorial por sí sola.
import { NICHES, type Niche } from '@sponcer/contracts';
import { fixtureProfiles } from '@sponcer/contracts/fixtures';
import { createNicheIndex } from '../application/niche-index';
import { cosine } from '../domain/cosine';
import { extractFeatures } from '../domain/features';
import { createTransformersEmbeddingProvider } from '../infrastructure/out/transformers/transformers-embedding-provider';

const TOP_K = 3;
const PERCENT = 100;
const HANDLE_PAD = 32;

/** Nicho esperado por handle (la verdad de terreno de los fixtures: el nombre del handle). */
const EXPECTED: Record<string, Niche> = {
  'sofi.moda.demo': 'moda',
  'diego.belleza.demo': 'belleza',
  'valeria.fitness.demo': 'fitness',
  'mateo.deportes.demo': 'deportes',
  'camila.gastronomia.demo': 'gastronomia',
  'andres.viajes.demo': 'viajes',
  'lucia.tecnologia.demo': 'tecnologia',
  'joaquin.gaming.demo': 'gaming',
  'daniela.musica.demo': 'musica',
  'renzo.entretenimiento.demo': 'entretenimiento',
  'ximena.educacion.demo': 'educacion',
  'bruno.finanzas.demo': 'finanzas',
  'fiorella.salud.demo': 'salud-bienestar',
  'gonzalo.familia.demo': 'familia-maternidad',
  'majo.mascotas.demo': 'mascotas',
  'piero.arte.demo': 'arte-diseno',
  'alessandra.emprendimiento.demo': 'emprendimiento',
  'rodrigo.hogar.demo': 'hogar-deco',
  'micaela.automotriz.demo': 'automotriz',
  'sebastian.lifestyle.demo': 'lifestyle',
  'andina.snacks.demo': 'gastronomia',
  'kallpa.sport.demo': 'deportes',
  'nube.tech.demo': 'tecnologia',
  'flor.cosmetica.demo': 'belleza',
  'rumbo.viajes.demo': 'viajes',
  'pata.feliz.demo': 'mascotas',
  'casa.nativa.demo': 'hogar-deco',
  'ahorra.ya.demo': 'finanzas',
  'sabor.costa.demo': 'gastronomia',
  'moto.ruta.demo': 'automotriz',
};

const provider = createTransformersEmbeddingProvider();
const vectors = await createNicheIndex(provider)();
const texts = fixtureProfiles.map((f) => extractFeatures(f.snapshot, null).text);
const embeddings = await provider.embed(texts);

const rows = fixtureProfiles.map((f, i) => {
  const ranked = [...NICHES].sort(
    (a, b) => cosine(embeddings[i]!, vectors[b]) - cosine(embeddings[i]!, vectors[a]),
  );
  const expected = EXPECTED[f.snapshot.handle];
  const top = ranked.slice(0, TOP_K);
  return {
    handle: f.snapshot.handle,
    expected,
    top,
    hit1: top[0] === expected,
    hit3: top.includes(expected as Niche),
  };
});

const verdict = (r: { hit1: boolean; hit3: boolean }) => [r.hit1, r.hit3].filter(Boolean).length;
const LABELS = ['MISS', 'top3', 'OK  '];
rows.forEach((r) =>
  console.log(
    `${LABELS[verdict(r)]} ${r.handle.padEnd(HANDLE_PAD)} esperado=${r.expected} obtenido=${r.top.join(', ')}`,
  ),
);
const pct = (n: number) => ((n / rows.length) * PERCENT).toFixed(1);
console.log(
  `\ntop-1: ${rows.filter((r) => r.hit1).length}/${rows.length} (${pct(rows.filter((r) => r.hit1).length)}%)`,
);
console.log(
  `top-3: ${rows.filter((r) => r.hit3).length}/${rows.length} (${pct(rows.filter((r) => r.hit3).length)}%)`,
);
