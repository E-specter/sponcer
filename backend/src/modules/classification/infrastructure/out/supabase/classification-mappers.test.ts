import type { Classification } from '@sponcer/contracts';
import { describe, expect, it } from 'vitest';
import {
  classificationToRow,
  embeddingToRow,
  fromVectorLiteral,
  rowToClassification,
  toVectorLiteral,
  type ClassificationRow,
} from './classification-mappers';

const classification: Classification = {
  niches: [{ niche: 'moda', confidence: 0.9, source: 'rules' }],
  tier: 'micro',
  followers: 12_000,
  engagementRate: 0.05,
  classifiedAt: '2026-11-25T10:00:00.000Z',
};

describe('classification mappers', () => {
  it('fila ↔ dominio sin pérdida', () => {
    const { profile_id: _id, ...row } = classificationToRow('p1', classification);
    expect(rowToClassification(row as ClassificationRow)).toEqual(classification);
  });

  it('acepta el timestamptz que devuelve Postgres', () => {
    const { profile_id: _id, ...row } = classificationToRow('p1', classification);
    expect(
      rowToClassification({
        ...(row as ClassificationRow),
        classified_at: '2026-11-25T10:00:00+00:00',
      }),
    ).toEqual(classification);
  });

  it('fila corrupta -> null', () => {
    expect(
      rowToClassification({
        niches: 'x',
        tier: 'huge',
        followers: 1,
        engagement_rate: 0,
        classified_at: '2026-11-25T10:00:00Z',
      }),
    ).toBeNull();
  });

  it('vector literal ida y vuelta', () => {
    const v = [0.5, -0.25, 0];
    expect(toVectorLiteral(v)).toBe('[0.5,-0.25,0]');
    expect(fromVectorLiteral(toVectorLiteral(v))).toEqual(v);
    expect(embeddingToRow('p1', v).embedding).toBe('[0.5,-0.25,0]');
  });
});
