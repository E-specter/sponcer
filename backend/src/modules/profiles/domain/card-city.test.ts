import { describe, expect, it } from 'vitest';
import { fixtureProfiles } from '@sponcer/contracts/fixtures';
import { toCard, toSummary } from './profile';

describe('toCard.city', () => {
  it('sale de declared.city y es null si no hay', () => {
    const f = fixtureProfiles.find((p) => p.declared?.city)!;
    const profile = {
      id: f.id,
      handle: f.snapshot.handle,
      role: f.role,
      status: f.status,
      ownerUserId: f.ownerUserId,
    };
    const summary = toSummary({ ...profile, declared: f.declared }, f.snapshot);
    expect(toCard(summary, f.declared, null, []).city).toBe(f.declared!.city);
    expect(toCard(summary, null, null, []).city).toBeNull();
  });
});
