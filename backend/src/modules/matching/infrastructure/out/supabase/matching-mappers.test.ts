import { describe, expect, it } from 'vitest';
import {
  interactionToRow,
  matchToRow,
  rowToInteraction,
  rowToMatch,
  type InteractionRow,
  type MatchRow,
} from './matching-mappers';

const interaction = {
  id: 'i1',
  actorProfileId: 'a',
  targetProfileId: 't',
  kind: 'interest' as const,
  createdAt: '2026-11-25T10:00:00.000Z',
};
const match = {
  id: 'm1',
  creatorProfileId: 'c',
  brandProfileId: 'b',
  createdAt: '2026-11-25T10:00:00.000Z',
};

describe('matching mappers', () => {
  it('interacción fila a dominio', () => {
    expect(rowToInteraction(interactionToRow(interaction) as InteractionRow)).toEqual(interaction);
  });

  it('match fila a dominio, normalizando el timestamptz de Postgres', () => {
    expect(rowToMatch(matchToRow(match) as MatchRow)).toEqual(match);
    expect(
      rowToMatch({ ...(matchToRow(match) as MatchRow), created_at: '2026-11-25T10:00:00+00:00' }),
    ).toEqual(match);
  });
});
