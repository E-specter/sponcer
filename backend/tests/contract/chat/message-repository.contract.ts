import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Message } from '@sponcer/contracts';
import type { MessageRepository } from '../../../src/modules/chat/application/ports/out/chat-ports';

export interface MatchRefHarness {
  matchId: string;
  /** Un perfil participante del match (remitente válido; en BD real, FK a profiles). */
  senderProfileId: string;
}

export interface MessageHarness {
  repo: MessageRepository;
  /** Un match que existe; cada llamada, uno distinto y vacío. */
  newMatch: () => Promise<MatchRefHarness>;
}

const T0 = Date.parse('2026-01-01T10:00:00.000Z');
const SECOND_MS = 1000;
const TWO = 2;
const THREE = 3;

const at = (n: number) => new Date(T0 + n * SECOND_MS).toISOString();
const msg = (m: MatchRefHarness, n: number, body = `mensaje ${n}`): Message => ({
  id: randomUUID(),
  matchId: m.matchId,
  senderProfileId: m.senderProfileId,
  body,
  createdAt: at(n),
});

/** Suite de `MessageRepository`: historial por match, más reciente primero, sin mezclar matches. */
export function describeMessageRepositoryContract(
  factory: () => MessageHarness | Promise<MessageHarness>,
): void {
  describe('MessageRepository (contrato del puerto)', () => {
    it('add + listByMatch conserva todos los campos (texto con tildes, emoji y comillas)', async () => {
      const { repo, newMatch } = await factory();
      const match = await newMatch();
      const m = msg(match, 0, 'hola, ¿cotizamos? 🙂 "comillas" y apóstrofes\'');
      await repo.add(m);
      expect(await repo.listByMatch(match.matchId, 0, THREE)).toEqual({ items: [m], total: 1 });
    });

    it('add con un id ya existente se rechaza con DomainError CONFLICT (sin duplicar el mensaje)', async () => {
      const { repo, newMatch } = await factory();
      const match = await newMatch();
      const original = msg(match, 0);
      await repo.add(original);
      await expect(repo.add({ ...original, body: 'otro' })).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      expect(await repo.listByMatch(match.matchId, 0, THREE)).toEqual({
        items: [original],
        total: 1,
      });
    });

    it('devuelve lo más reciente primero', async () => {
      const { repo, newMatch } = await factory();
      const match = await newMatch();
      const [a, b, c] = [msg(match, 1), msg(match, THREE), msg(match, TWO)];
      await Promise.all([a, b, c].map((m) => repo.add(m)));
      const page = await repo.listByMatch(match.matchId, 0, THREE);
      expect(page.items.map((m) => m.id)).toEqual([b.id, c.id, a.id]);
    });

    it('pagina con offset y limit sin repetir ni perder mensajes, y el total es el del match', async () => {
      const { repo, newMatch } = await factory();
      const match = await newMatch();
      const all = [0, 1, TWO, THREE, THREE + 1].map((i) => msg(match, i));
      await Promise.all(all.map((m) => repo.add(m)));
      const first = await repo.listByMatch(match.matchId, 0, THREE);
      const second = await repo.listByMatch(match.matchId, THREE, THREE);
      expect([...first.items, ...second.items].map((m) => m.id)).toEqual(
        [...all].reverse().map((m) => m.id),
      );
      expect(first.total).toBe(all.length);
      expect((await repo.listByMatch(match.matchId, all.length, THREE)).items).toEqual([]);
    });

    it('mensajes con el mismo createdAt tienen un orden estable entre lecturas', async () => {
      const { repo, newMatch } = await factory();
      const match = await newMatch();
      await Promise.all([0, 1, TWO].map(() => repo.add(msg(match, 0))));
      const x = await repo.listByMatch(match.matchId, 0, THREE);
      const y = await repo.listByMatch(match.matchId, 0, THREE);
      expect(x.items.map((m) => m.id)).toEqual(y.items.map((m) => m.id));
    });

    it('un match no ve los mensajes de otro (ACL)', async () => {
      const { repo, newMatch } = await factory();
      const [one, other] = [await newMatch(), await newMatch()];
      const mine = msg(one, 0);
      await repo.add(mine);
      await repo.add(msg(other, 1));
      const page = await repo.listByMatch(one.matchId, 0, THREE * THREE);
      expect(page.items.map((m) => m.id)).toEqual([mine.id]);
      expect(page.total).toBe(1);
    });

    it('un match sin mensajes da { items: [], total: 0 }', async () => {
      const { repo, newMatch } = await factory();
      expect(await repo.listByMatch((await newMatch()).matchId, 0, THREE)).toEqual({
        items: [],
        total: 0,
      });
    });
  });
}
