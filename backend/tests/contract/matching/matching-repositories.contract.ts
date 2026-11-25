import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { InteractionRepository } from '../../../src/modules/matching/application/ports/out/interaction-repository';
import type { MatchRepository } from '../../../src/modules/matching/application/ports/out/match-repository';
import type { Interaction, MatchRecord } from '../../../src/modules/matching/domain/candidate';

export interface ProfileTrio {
  /** Perfiles que existen (en BD real, filas de `profiles`: hay FK). */
  creatorId: string;
  brandId: string;
  otherId: string;
}

export interface InteractionHarness {
  repo: InteractionRepository;
  /** Cada llamada devuelve perfiles nuevos y sin interacciones. */
  newTrio: () => Promise<ProfileTrio>;
}

export interface MatchHarness {
  repo: MatchRepository;
  newTrio: () => Promise<ProfileTrio>;
}

const T0 = Date.parse('2026-01-01T10:00:00.000Z');
const SECOND_MS = 1000;
const BURST = 10;
const TWO = 2;
const THREE = 3;
const at = (n: number) => new Date(T0 + n * SECOND_MS).toISOString();

const interaction = (
  actor: string,
  target: string,
  kind: Interaction['kind'],
  n: number,
): Interaction => ({
  id: randomUUID(),
  actorProfileId: actor,
  targetProfileId: target,
  kind,
  createdAt: at(n),
});
const match = (t: ProfileTrio, n = 0): MatchRecord => ({
  id: randomUUID(),
  creatorProfileId: t.creatorId,
  brandProfileId: t.brandId,
  createdAt: at(n),
});

/** Suite de `InteractionRepository`: una interacción por par (actor, objetivo); la nueva reemplaza. */
export function describeInteractionRepositoryContract(
  factory: () => InteractionHarness | Promise<InteractionHarness>,
): void {
  describe('InteractionRepository (contrato del puerto)', () => {
    it('find devuelve null si no hay interacción', async () => {
      const { repo, newTrio } = await factory();
      const t = await newTrio();
      expect(await repo.find(t.creatorId, t.brandId)).toBeNull();
    });

    it('upsert + find conserva todos los campos', async () => {
      const { repo, newTrio } = await factory();
      const t = await newTrio();
      const i = interaction(t.creatorId, t.brandId, 'interest', 1);
      await repo.upsert(i);
      expect(await repo.find(t.creatorId, t.brandId)).toEqual(i);
    });

    it('un segundo upsert del mismo par REEMPLAZA a la anterior (una por par)', async () => {
      const { repo, newTrio } = await factory();
      const t = await newTrio();
      await repo.upsert(interaction(t.creatorId, t.brandId, 'interest', 1));
      const second = interaction(t.creatorId, t.brandId, 'dismiss', TWO);
      await repo.upsert(second);
      expect(await repo.find(t.creatorId, t.brandId)).toEqual(second);
      expect(await repo.listByActor(t.creatorId)).toEqual([second]);
    });

    it('la dirección importa: (a→b) y (b→a) son interacciones distintas', async () => {
      const { repo, newTrio } = await factory();
      const t = await newTrio();
      const forward = interaction(t.creatorId, t.brandId, 'interest', 1);
      const back = interaction(t.brandId, t.creatorId, 'dismiss', TWO);
      await Promise.all([repo.upsert(forward), repo.upsert(back)]);
      expect(await repo.find(t.creatorId, t.brandId)).toEqual(forward);
      expect(await repo.find(t.brandId, t.creatorId)).toEqual(back);
    });

    it('listByActor devuelve solo las del actor, de todos sus objetivos (ACL)', async () => {
      const { repo, newTrio } = await factory();
      const t = await newTrio();
      const toBrand = interaction(t.creatorId, t.brandId, 'interest', 1);
      const toOther = interaction(t.creatorId, t.otherId, 'dismiss', TWO);
      const foreign = interaction(t.brandId, t.otherId, 'interest', THREE);
      await Promise.all([toBrand, toOther, foreign].map((i) => repo.upsert(i)));
      const mine = await repo.listByActor(t.creatorId);
      expect(mine.map((i) => i.id).sort()).toEqual([toBrand.id, toOther.id].sort());
    });

    it('upserts concurrentes del mismo par dejan una sola fila', async () => {
      const { repo, newTrio } = await factory();
      const t = await newTrio();
      await Promise.all(
        Array.from({ length: BURST }, (_, n) =>
          repo.upsert(interaction(t.creatorId, t.brandId, n % TWO ? 'interest' : 'dismiss', n)),
        ),
      );
      expect(await repo.listByActor(t.creatorId)).toHaveLength(1);
    });

    it('un actor sin interacciones recibe []', async () => {
      const { repo, newTrio } = await factory();
      expect(await repo.listByActor((await newTrio()).otherId)).toEqual([]);
    });
  });
}

/** Suite de `MatchRepository`: un solo match por par creador/marca, creación atómica. */
export function describeMatchRepositoryContract(
  factory: () => MatchHarness | Promise<MatchHarness>,
): void {
  describe('MatchRepository (contrato del puerto)', () => {
    it('createIfAbsent crea el match y getById lo devuelve igual', async () => {
      const { repo, newTrio } = await factory();
      const m = match(await newTrio());
      expect(await repo.createIfAbsent(m)).toEqual({ match: m, created: true });
      expect(await repo.getById(m.id)).toEqual(m);
    });

    it('un segundo createIfAbsent del mismo par devuelve el existente y created=false', async () => {
      const { repo, newTrio } = await factory();
      const t = await newTrio();
      const first = match(t, 1);
      await repo.createIfAbsent(first);
      const again = await repo.createIfAbsent({ ...match(t, TWO) });
      expect(again).toEqual({ match: first, created: false });
    });

    it('es atómico: una ráfaga del mismo par crea exactamente un match', async () => {
      const { repo, newTrio } = await factory();
      const t = await newTrio();
      const results = await Promise.all(
        Array.from({ length: BURST }, (_, n) => repo.createIfAbsent(match(t, n))),
      );
      expect(results.filter((r) => r.created)).toHaveLength(1);
      expect(new Set(results.map((r) => r.match.id)).size).toBe(1);
    });

    it('getById devuelve null si no existe', async () => {
      const { repo } = await factory();
      expect(await repo.getById(randomUUID())).toBeNull();
    });

    it('listByProfile devuelve los matches donde el perfil es creador o marca, y solo esos (ACL)', async () => {
      const { repo, newTrio } = await factory();
      const [one, two] = [await newTrio(), await newTrio()];
      const mine = match(one);
      await repo.createIfAbsent(mine);
      await repo.createIfAbsent(match(two));
      expect((await repo.listByProfile(one.creatorId)).map((m) => m.id)).toEqual([mine.id]);
      expect((await repo.listByProfile(one.brandId)).map((m) => m.id)).toEqual([mine.id]);
      expect(await repo.listByProfile(one.otherId)).toEqual([]);
    });
  });
}
