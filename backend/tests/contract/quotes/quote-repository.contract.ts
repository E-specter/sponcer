import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { QuoteRecord } from '@sponcer/contracts';
import type { QuoteRepository } from '../../../src/modules/quotes/application/ports/out/quote-repository';

export interface QuoteScenario {
  /** Campaña existente de la marca solicitante (en BD real, FK a campaigns). */
  campaignId: string;
  /** Servicio existente del creador (en BD real, FK a creator_services). */
  serviceId: string;
  creatorProfileId: string;
  requesterProfileId: string;
  /** Un tercer perfil existente, ajeno a las cotizaciones. */
  strangerProfileId: string;
}

export interface QuoteHarness {
  repo: QuoteRepository;
  /** Cada llamada devuelve perfiles y servicio nuevos, sin cotizaciones. */
  newScenario: () => Promise<QuoteScenario>;
}

type Event = QuoteRecord['history'][number];
const T0 = Date.parse('2026-01-01T10:00:00.000Z');
const SECOND_MS = 1000;
const TWO = 2;
const AMOUNT = 350;
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

const at = (n: number) => new Date(T0 + n * SECOND_MS).toISOString();
const event = (
  s: QuoteScenario,
  n: number,
  from: Event['from'],
  to: Event['to'],
  note: string | null = null,
): Event => ({
  from,
  to,
  actorProfileId: s.requesterProfileId,
  note,
  at: at(n),
});
const quote = (
  s: QuoteScenario,
  history: Event[],
  over: Partial<QuoteRecord> = {},
): QuoteRecord => ({
  id: randomUUID(),
  campaignId: s.campaignId,
  serviceId: s.serviceId,
  creatorProfileId: s.creatorProfileId,
  requesterProfileId: s.requesterProfileId,
  status: history.at(-1)?.to ?? 'draft',
  amountPen: null,
  message: 'Hola, me interesa tu servicio',
  history,
  createdAt: at(0),
  updatedAt: at(history.length),
  ...over,
});

/** Suite de `QuoteRepository`: el historial es append-only y las listas respetan a las partes. */
export function describeQuoteRepositoryContract(
  factory: () => QuoteHarness | Promise<QuoteHarness>,
): void {
  describe('QuoteRepository (contrato del puerto)', () => {
    it('findById devuelve null si no existe', async () => {
      expect(await (await factory()).repo.findById(MISSING_ID)).toBeNull();
    });

    it('save + findById conserva todos los campos, incluido el historial', async () => {
      const { repo, newScenario } = await factory();
      const s = await newScenario();
      const q = quote(s, [event(s, 1, null, 'sent', 'primer mensaje')], { amountPen: AMOUNT });
      await repo.save(q);
      expect(await repo.findById(q.id)).toEqual(q);
    });

    it('amountPen nulo y nota nula vuelven como null', async () => {
      const { repo, newScenario } = await factory();
      const s = await newScenario();
      const q = quote(s, [event(s, 1, null, 'draft')]);
      await repo.save(q);
      const found = await repo.findById(q.id);
      expect(found?.amountPen).toBeNull();
      expect(found?.history[0]?.note).toBeNull();
    });

    it('volver a guardar con eventos nuevos AÑADE al historial sin reescribir los anteriores', async () => {
      const { repo, newScenario } = await factory();
      const s = await newScenario();
      const first = event(s, 1, null, 'sent');
      const q = quote(s, [first]);
      await repo.save(q);
      const second = event(s, TWO, 'sent', 'negotiating', 'contraoferta');
      await repo.save({
        ...q,
        status: 'negotiating',
        amountPen: AMOUNT,
        history: [first, second],
        updatedAt: at(TWO),
      });
      const found = await repo.findById(q.id);
      expect(found?.history).toEqual([first, second]);
      expect(found).toMatchObject({ status: 'negotiating', amountPen: AMOUNT });
    });

    it('guardar dos veces lo mismo no duplica eventos (idempotente)', async () => {
      const { repo, newScenario } = await factory();
      const s = await newScenario();
      const q = quote(s, [event(s, 1, null, 'sent'), event(s, TWO, 'sent', 'accepted')]);
      await repo.save(q);
      await repo.save(q);
      expect((await repo.findById(q.id))?.history).toHaveLength(TWO);
    });

    it('eventos con el mismo instante conservan el orden de inserción', async () => {
      const { repo, newScenario } = await factory();
      const s = await newScenario();
      const same = [
        event(s, 1, null, 'draft'),
        event(s, 1, 'draft', 'sent'),
        event(s, 1, 'sent', 'accepted'),
      ];
      const q = quote(s, same);
      await repo.save(q);
      expect((await repo.findById(q.id))?.history.map((e) => e.to)).toEqual([
        'draft',
        'sent',
        'accepted',
      ]);
    });

    it('listByProfile devuelve las cotizaciones donde el perfil es creador o solicitante, y solo esas', async () => {
      const { repo, newScenario } = await factory();
      const s = await newScenario();
      const q = quote(s, [event(s, 1, null, 'sent')]);
      await repo.save(q);
      expect((await repo.listByProfile(s.requesterProfileId)).map((x) => x.id)).toEqual([q.id]);
      expect((await repo.listByProfile(s.creatorProfileId)).map((x) => x.id)).toEqual([q.id]);
      expect(await repo.listByProfile(s.strangerProfileId)).toEqual([]);
    });

    it('listByCampaign devuelve solo las de esa campaña', async () => {
      const { repo, newScenario } = await factory();
      const [one, two] = [await newScenario(), await newScenario()];
      const mine = quote(one, [event(one, 1, null, 'sent')]);
      await repo.save(mine);
      await repo.save(quote(two, [event(two, 1, null, 'sent')]));
      expect((await repo.listByCampaign(one.campaignId)).map((x) => x.id)).toEqual([mine.id]);
    });

    it('serviceId nulo (propuesta abierta) se guarda y vuelve como null', async () => {
      const { repo, newScenario } = await factory();
      const s = await newScenario();
      const q = quote(s, [event(s, 1, null, 'sent')], { serviceId: null });
      await repo.save(q);
      expect((await repo.findById(q.id))?.serviceId).toBeNull();
    });

    it('una segunda cotización abierta al mismo creador en la campaña es CONFLICT; tras cerrar la primera, no', async () => {
      const { repo, newScenario } = await factory();
      const s = await newScenario();
      const first = quote(s, [event(s, 1, null, 'sent')]);
      await repo.save(first);
      await expect(repo.save(quote(s, [event(s, 1, null, 'sent')]))).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      await repo.save({
        ...first,
        status: 'cancelled',
        history: [...first.history, event(s, TWO, 'sent', 'cancelled')],
        updatedAt: at(TWO),
      });
      await repo.save(quote(s, [event(s, TWO, null, 'sent')]));
      expect(await repo.listByCampaign(s.campaignId)).toHaveLength(TWO);
    });

    it('listByProfile no mezcla cotizaciones de otros escenarios (ACL)', async () => {
      const { repo, newScenario } = await factory();
      const [one, two] = [await newScenario(), await newScenario()];
      await repo.save(quote(one, [event(one, 1, null, 'sent')]));
      const mine = quote(two, [event(two, 1, null, 'sent')]);
      await repo.save(mine);
      expect((await repo.listByProfile(two.creatorProfileId)).map((x) => x.id)).toEqual([mine.id]);
    });

    it('las fechas vuelven como ISO 8601 con Z (el mismo instante que se guardó)', async () => {
      const { repo, newScenario } = await factory();
      const s = await newScenario();
      const q = quote(s, [event(s, 1, null, 'sent')]);
      await repo.save(q);
      const found = await repo.findById(q.id);
      expect([found?.createdAt, found?.updatedAt, found?.history[0]?.at]).toEqual([
        q.createdAt,
        q.updatedAt,
        q.history[0]!.at,
      ]);
    });
  });
}
