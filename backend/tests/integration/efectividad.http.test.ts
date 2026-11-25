import { describe, expect, it } from 'vitest';
import { api, type ProfileCard } from '@sponcer/contracts';
import { demoUser } from '@sponcer/contracts/fixtures';
import { buildTestApp, call, demoBrand, STATUS } from '../support/app';

describe('Fase 5 · Pruebas de efectividad del sistema (Sponcer)', () => {
  it('mide la precisión de coincidencia del feed por nicho y palabra clave (>= 100%)', async () => {
    const { app } = await buildTestApp();
    const consultas = ['gaming', 'deportes', 'moda'];

    for (const q of consultas) {
      const inicio = performance.now();
      const res = await call(
        app,
        'get',
        `${api.feed.path}?profileId=${demoBrand.id}&limit=20&q=${encodeURIComponent(q)}`,
        demoUser.id,
      );
      const duracionMs = performance.now() - inicio;

      expect(res.status).toBe(STATUS.OK);

      const cards: ProfileCard[] = res.body.items.map((i: { card: ProfileCard }) => i.card);
      expect(cards.length).toBeGreaterThan(0);

      const relevantes = cards.filter((c) => {
        const texto = [c.fullName, c.handle, c.bio ?? '', ...c.niches].join(' ').toLowerCase();
        return texto.includes(q.toLowerCase());
      });

      const efectividad = (relevantes.length / cards.length) * 100;
      expect(efectividad).toBe(100);
      expect(duracionMs).toBeLessThan(1000);
    }
  });

  it('valida efectividad sin falsos positivos al combinar ciudad y término de búsqueda', async () => {
    const { app } = await buildTestApp();
    const res = await call(
      app,
      'get',
      `${api.feed.path}?profileId=${demoBrand.id}&limit=20&q=demo&city=trujillo`,
      demoUser.id,
    );

    expect(res.status).toBe(STATUS.OK);
    const cards: ProfileCard[] = res.body.items.map((i: { card: ProfileCard }) => i.card);

    expect(cards.every((c) => c.city === 'trujillo')).toBe(true);
  });

  it('garantiza resiliencia y respuesta controlada ante consultas sin resultados', async () => {
    const { app } = await buildTestApp();
    const res = await call(
      app,
      'get',
      `${api.feed.path}?profileId=${demoBrand.id}&limit=20&q=nicho_inexistente_f5`,
      demoUser.id,
    );

    expect(res.status).toBe(STATUS.OK);
    expect(res.body.items).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
  });
});
