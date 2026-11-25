import { describe, expect, it } from 'vitest';
import { demoUser, fixtureProfiles } from '@sponcer/contracts/fixtures';
import type { Profile } from '../../../src/modules/profiles/domain/profile';
import type { ProfileReader } from '../../../src/modules/profiles/application/ports/out/profile-reader';
import type { ProfileWriter } from '../../../src/modules/profiles/application/ports/out/profile-writer';

const NEW_ID = '99999999-9999-4999-8999-999999999999';
const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const FIXTURE = fixtureProfiles[0]!;

const asProfile = (f: (typeof fixtureProfiles)[number]): Profile => ({
  id: f.id,
  handle: f.snapshot.handle,
  role: f.role,
  status: f.status,
  ownerUserId: f.ownerUserId,
  declared: f.declared,
});
const sorted = (ids: string[]) => [...ids].sort();

/**
 * Suite de `ProfileReader` + `ProfileWriter`. `factory` devuelve el repositorio recién sembrado
 * con `contracts/fixtures` (mismo seed que la BD local en el adaptador real).
 */
export function describeProfileRepositoryContract(
  factory: () => (ProfileReader & ProfileWriter) | Promise<ProfileReader & ProfileWriter>,
): void {
  describe('ProfileReader + ProfileWriter (contrato del puerto)', () => {
    it('findById devuelve el perfil sembrado con sus campos de dominio', async () => {
      expect(await (await factory()).findById(FIXTURE.id)).toEqual(asProfile(FIXTURE));
    });

    it('findById y findByHandle devuelven null si no existe', async () => {
      const repo = await factory();
      expect(await repo.findById(MISSING_ID)).toBeNull();
      expect(await repo.findByHandle('no.existe.zz')).toBeNull();
    });

    it('findByHandle usa el handle normalizado (minúsculas, sin @)', async () => {
      const repo = await factory();
      expect(await repo.findByHandle(FIXTURE.snapshot.handle)).toEqual(asProfile(FIXTURE));
    });

    it('listByOwner devuelve exactamente los perfiles del dueño', async () => {
      const expected = fixtureProfiles
        .filter((f) => f.ownerUserId === demoUser.id)
        .map((f) => f.id);
      const got = await (await factory()).listByOwner(demoUser.id);
      expect(sorted(got.map((p) => p.id))).toEqual(sorted(expected));
      expect(got.every((p) => p.ownerUserId === demoUser.id)).toBe(true);
    });

    it('listByOwner de un usuario sin perfiles es []', async () => {
      expect(await (await factory()).listByOwner(MISSING_ID)).toEqual([]);
    });

    it('listByRole devuelve todos los perfiles del rol y ninguno de otro', async () => {
      const got = await (await factory()).listByRole('brand');
      const expected = fixtureProfiles.filter((f) => f.role === 'brand').map((f) => f.id);
      expect(sorted(got.map((p) => p.id))).toEqual(sorted(expected));
    });

    it('save crea un perfil nuevo que se lee por id y por handle', async () => {
      const repo = await factory();
      const created: Profile = {
        id: NEW_ID,
        handle: 'perfil.nuevo.test',
        role: 'creator',
        status: 'verified',
        ownerUserId: demoUser.id,
        declared: null,
      };
      await repo.save(created);
      expect(await repo.findById(NEW_ID)).toEqual(created);
      expect(await repo.findByHandle(created.handle)).toEqual(created);
    });

    it('save sobre un id existente reemplaza el perfil sin tocar los demás', async () => {
      const repo = await factory();
      const other = fixtureProfiles.find((f) => f.id !== FIXTURE.id)!;
      await repo.save({
        ...asProfile(FIXTURE),
        status: 'removed',
        ownerUserId: null,
        declared: null,
      });
      expect(await repo.findById(FIXTURE.id)).toMatchObject({
        status: 'removed',
        ownerUserId: null,
        declared: null,
      });
      expect(await repo.findById(other.id)).toEqual(asProfile(other));
    });

    // unique(ig_handle): la ingesta bajo demanda depende de este CONFLICT para resolver la carrera (RF-01).
    it('save de un handle que ya tiene otro perfil (otro id) se rechaza con DomainError CONFLICT', async () => {
      const repo = await factory();
      const clash: Profile = { ...asProfile(FIXTURE), id: NEW_ID };
      await expect(repo.save(clash)).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(await repo.findById(NEW_ID)).toBeNull();
      expect(await repo.findByHandle(FIXTURE.snapshot.handle)).toEqual(asProfile(FIXTURE));
    });

    it('save devuelve true al crear y al actualizar una ficha no retirada', async () => {
      const repo = await factory();
      const fresh: Profile = { ...asProfile(FIXTURE), id: NEW_ID, handle: 'perfil.true.test' };
      expect(await repo.save(fresh)).toBe(true);
      expect(await repo.save({ ...fresh, declared: null })).toBe(true);
    });

    // Ley 29733: una edición concurrente no puede revivir una ficha que el titular retiró.
    it('save NUNCA revive una ficha retirada: devuelve false y la deja como estaba', async () => {
      const repo = await factory();
      const removed: Profile = { ...asProfile(FIXTURE), status: 'removed' };
      expect(await repo.save(removed)).toBe(true);
      const attempts = [
        { ...removed, status: 'verified' as const },
        { ...removed, status: 'unclaimed' as const, ownerUserId: null },
      ];
      const results = await Promise.all(attempts.map((p) => repo.save(p)));
      expect(results).toEqual([false, false]);
      expect(await repo.findById(FIXTURE.id)).toEqual(removed);
    });

    it('sobre una ficha retirada solo se puede mantener retirada (save removed → true)', async () => {
      const repo = await factory();
      const removed: Profile = { ...asProfile(FIXTURE), status: 'removed' };
      await repo.save(removed);
      expect(await repo.save(removed)).toBe(true);
    });

    it('un retiro concurrente con una edición deja la ficha retirada, gane quien gane', async () => {
      const repo = await factory();
      const base = asProfile(FIXTURE);
      await Promise.all([
        repo.save({ ...base, declared: null }),
        repo.save({ ...base, status: 'removed' }),
        repo.save({ ...base, declared: null }),
      ]);
      expect((await repo.findById(FIXTURE.id))?.status).toBe('removed');
    });

    it('los removidos siguen legibles: claimProfile los usa como lista de bloqueo y el filtro es del caso de uso', async () => {
      const repo = await factory();
      await repo.save({ ...asProfile(FIXTURE), status: 'removed' });
      expect(await repo.findByHandle(FIXTURE.snapshot.handle)).toMatchObject({ status: 'removed' });
      expect((await repo.listByRole(FIXTURE.role)).map((p) => p.id)).toContain(FIXTURE.id);
    });
  });
}
