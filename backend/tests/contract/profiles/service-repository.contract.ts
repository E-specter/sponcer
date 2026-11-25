import { describe, expect, it } from 'vitest';
import { Service, type ServiceInput } from '@sponcer/contracts';
import type { ServiceRepository } from '../../../src/modules/profiles/application/ports/out/service-repository';

export interface CatalogRef {
  profileId: string;
  services: Service[];
}

export interface ServiceHarness {
  repo: ServiceRepository;
  /** Perfil creador con un catálogo sembrado de 2 o más servicios. */
  withServices: CatalogRef;
  /** Otro perfil creador, también con servicios (para comprobar el aislamiento). */
  otherWithServices: CatalogRef;
  /** Perfil existente sin servicios. */
  emptyProfileId: string;
}

export interface ServiceOptions {
  /**
   * `replace` conserva los ids de los servicios cuyo contenido no cambia (quotes.service_id es RESTRICT:
   * borrar y reinsertar rompería las cotizaciones). El mock actual NO lo cumple (hallazgo F2-M-1).
   */
  stableIds: boolean;
}

const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const P1 = 150;
const P2 = 400;
const P3 = 999;
const TWO = 2;

const stripIds = (xs: Service[]): ServiceInput[] => xs.map(({ id: _id, ...rest }) => rest);
const inputOf = (s: Service): ServiceInput => stripIds([s])[0]!;
const input = (base: ServiceInput, price: number, description: string): ServiceInput => ({
  ...base,
  pricePen: price,
  description,
});

/** Suite de `ServiceRepository`. `factory` devuelve el repositorio con los datos de `ServiceHarness`. */
export function describeServiceRepositoryContract(
  factory: () => ServiceHarness | Promise<ServiceHarness>,
  opts: ServiceOptions = { stableIds: true },
): void {
  describe('ServiceRepository (contrato del puerto)', () => {
    it('list devuelve el catálogo sembrado, válido contra el esquema Service', async () => {
      const h = await factory();
      const got = await h.repo.list(h.withServices.profileId);
      expect(got.map((s) => s.id).sort()).toEqual(h.withServices.services.map((s) => s.id).sort());
      expect(got).toEqual(expect.arrayContaining(h.withServices.services));
      got.forEach((s) => expect(Service.safeParse(s).success).toBe(true));
    });

    it('list de un perfil sin servicios o inexistente es []', async () => {
      const h = await factory();
      expect(await h.repo.list(h.emptyProfileId)).toEqual([]);
      expect(await h.repo.list(MISSING_ID)).toEqual([]);
    });

    it('findById devuelve el servicio con el perfil dueño, o null', async () => {
      const h = await factory();
      const first = h.withServices.services[0]!;
      expect(await h.repo.findById(first.id)).toEqual({
        service: first,
        profileId: h.withServices.profileId,
      });
      expect(await h.repo.findById(MISSING_ID)).toBeNull();
    });

    it('replace devuelve los servicios con id (uuid), en el orden dado, y list devuelve lo mismo', async () => {
      const h = await factory();
      const base = inputOf(h.withServices.services[0]!);
      const inputs = [input(base, P1, 'uno'), input(base, P2, 'dos')];
      const saved = await h.repo.replace(h.emptyProfileId, inputs);
      expect(saved).toHaveLength(TWO);
      saved.forEach((s) => expect(Service.safeParse(s).success).toBe(true));
      expect(stripIds(saved)).toEqual(inputs);
      expect(new Set(saved.map((s) => s.id)).size).toBe(TWO);
      expect(await h.repo.list(h.emptyProfileId)).toEqual(saved);
    });

    it('replace reemplaza todo el catálogo anterior (no acumula)', async () => {
      const h = await factory();
      const base = inputOf(h.withServices.services[0]!);
      const saved = await h.repo.replace(h.withServices.profileId, [input(base, P3, 'único')]);
      expect(await h.repo.list(h.withServices.profileId)).toEqual(saved);
      expect(saved).toHaveLength(1);
    });

    it('replace con [] vacía el catálogo', async () => {
      const h = await factory();
      expect(await h.repo.replace(h.withServices.profileId, [])).toEqual([]);
      expect(await h.repo.list(h.withServices.profileId)).toEqual([]);
    });

    it('replace de un perfil no afecta al catálogo de otro', async () => {
      const h = await factory();
      const base = inputOf(h.withServices.services[0]!);
      await h.repo.replace(h.withServices.profileId, [input(base, P1, 'solo este')]);
      const other = await h.repo.list(h.otherWithServices.profileId);
      expect(other.map((s) => s.id).sort()).toEqual(
        h.otherWithServices.services.map((s) => s.id).sort(),
      );
    });

    describe('ids estables (cotizaciones apuntan a service_id)', () => {
      const stable = opts.stableIds ? it : it.fails;

      stable('reemplazar con el mismo contenido conserva todos los ids', async () => {
        const h = await factory();
        const same = h.withServices.services.map(inputOf);
        const saved = await h.repo.replace(h.withServices.profileId, same);
        expect(saved.map((s) => s.id)).toEqual(h.withServices.services.map((s) => s.id));
      });

      stable('reordenar los mismos servicios conserva el id de cada uno', async () => {
        const h = await factory();
        const reversed = [...h.withServices.services].reverse();
        const saved = await h.repo.replace(h.withServices.profileId, reversed.map(inputOf));
        expect(saved.map((s) => s.id)).toEqual(reversed.map((s) => s.id));
        expect((await h.repo.list(h.withServices.profileId)).map((s) => s.id)).toEqual(
          reversed.map((s) => s.id),
        );
      });

      stable(
        'quitar un servicio conserva el id de los demás y añadir uno da un id nuevo',
        async () => {
          const h = await factory();
          const [keep, drop] = h.withServices.services as [Service, Service];
          const kept = await h.repo.replace(h.withServices.profileId, [inputOf(keep)]);
          expect(kept.map((s) => s.id)).toEqual([keep.id]);
          const grown = await h.repo.replace(h.withServices.profileId, [
            inputOf(keep),
            input(inputOf(drop), P3, 'nuevo'),
          ]);
          expect(grown[0]!.id).toBe(keep.id);
          expect(h.withServices.services.map((s) => s.id)).not.toContain(grown[1]!.id);
          expect(grown).toHaveLength(TWO);
        },
      );

      stable(
        'editar un servicio (precio) lo actualiza en sitio: mismo id, contenido nuevo',
        async () => {
          const h = await factory();
          const [first, ...rest] = h.withServices.services as [Service, ...Service[]];
          const edited = [input(inputOf(first), P3, 'editado'), ...rest.map(inputOf)];
          const saved = await h.repo.replace(h.withServices.profileId, edited);
          expect(saved).toHaveLength(h.withServices.services.length);
          expect(saved[0]).toMatchObject({ pricePen: P3, description: 'editado' });
          expect(saved.map((s) => s.id).sort()).toEqual(
            h.withServices.services.map((s) => s.id).sort(),
          );
        },
      );
    });
  });
}
