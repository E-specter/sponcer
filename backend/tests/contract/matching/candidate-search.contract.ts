import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CandidateSearch } from '../../../src/modules/matching/application/ports/out/candidate-search';
import type { Candidate } from '../../../src/modules/matching/domain/candidate';

export interface CandidateHarness {
  search: CandidateSearch;
  /** Perfil con embedding (rol A). */
  viewerId: string;
  /** Perfiles de rol B con embedding: `closeId` idéntico al del viewer, `farId` ortogonal. */
  closeId: string;
  farId: string;
  /** Un perfil de rol A sin embedding (aún sin clasificar). */
  unclassifiedViewerId: string;
  /** Perfil de rol B retirado a pedido del titular, con embedding (solo se prueba si el adaptador lo puede crear). */
  removedId?: string;
}

const cosine = (a: number[], b: number[]): number => {
  const dot = a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
  const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return dot / (norm(a) * norm(b));
};

/** Puntuación con la que el scoring ordena: la similitud de pgvector si viene, o el coseno de los embeddings. */
const similarityOf = (viewer: Candidate, c: Candidate): number | null =>
  c.similarity ?? (viewer.embedding && c.embedding ? cosine(viewer.embedding, c.embedding) : null);

/** Suite de `CandidateSearch`: el pool de rol opuesto, sin el viewer ni retirados, rankeable por similitud. */
export function describeCandidateSearchContract(
  factory: () => CandidateHarness | Promise<CandidateHarness>,
): void {
  describe('CandidateSearch (contrato del puerto)', () => {
    it('un viewer inexistente da NOT_FOUND', async () => {
      const { search } = await factory();
      const r = await search.find(randomUUID());
      expect(!r.ok && r.error.code).toBe('NOT_FOUND');
    });

    it('devuelve el viewer y candidatos solo del rol opuesto, sin el propio viewer', async () => {
      const h = await factory();
      const r = await h.search.find(h.viewerId);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.viewer.card.id).toBe(h.viewerId);
      const roles = new Set(r.value.candidates.map((c) => c.card.role));
      expect([...roles]).toEqual([r.value.viewer.card.role === 'creator' ? 'brand' : 'creator']);
      expect(r.value.candidates.map((c) => c.card.id)).not.toContain(h.viewerId);
    });

    it('incluye a los candidatos clasificados, cada uno rankeable (similitud o embedding)', async () => {
      const h = await factory();
      const r = await h.search.find(h.viewerId);
      if (!r.ok) throw r.error;
      const byId = new Map(r.value.candidates.map((c) => [c.card.id, c]));
      [h.closeId, h.farId].forEach((id) => {
        const c = byId.get(id);
        expect(c, `falta el candidato ${id}`).toBeDefined();
        expect(similarityOf(r.value.viewer, c!)).not.toBeNull();
      });
    });

    it('el candidato idéntico al viewer puntúa más alto que el ortogonal', async () => {
      const h = await factory();
      const r = await h.search.find(h.viewerId);
      if (!r.ok) throw r.error;
      const score = (id: string) =>
        similarityOf(
          r.value.viewer,
          r.value.candidates.find((c) => c.card.id === id)!,
        )!;
      expect(score(h.closeId)).toBeGreaterThan(score(h.farId));
    });

    it('un viewer sin clasificar no rompe la búsqueda: devuelve candidatos de rol opuesto', async () => {
      const h = await factory();
      const r = await h.search.find(h.unclassifiedViewerId);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.viewer.embedding).toBeNull();
      expect(r.value.candidates.every((c) => c.card.role !== r.value.viewer.card.role)).toBe(true);
    });

    it('un perfil retirado a pedido del titular no aparece como candidato (privacidad)', async () => {
      const h = await factory();
      if (!h.removedId) return;
      const r = await h.search.find(h.viewerId);
      if (!r.ok) throw r.error;
      expect(r.value.candidates.map((c) => c.card.id)).not.toContain(h.removedId);
    });
  });
}
