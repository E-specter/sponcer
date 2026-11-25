import { NICHES, type Classification, type Niche } from '@sponcer/contracts';
import { DomainError } from '../../../../shared/errors';
import type { EventBus } from '../../../../shared/events/event-bus';
import { err, ok, type Result } from '../../../../shared/result';
import { cosine } from '../../domain/cosine';
import { declaredNiches, extractFeatures } from '../../domain/features';
import { classifyNiches } from '../../domain/niche-strategies';
import type { ClassificationRepository } from '../ports/out/classification-repository';
import type { EmbeddingProvider } from '../ports/out/embedding-provider';
import type { ProfileReader } from '../ports/out/profile-reader';
import type { SnapshotSource } from '../ports/out/snapshot-source';

export type ClassifyProfile = (profileId: string) => Promise<Result<Classification, DomainError>>;

/** Pipeline (ADR-003): extracción → features → nichos → persistencia → ProfileClassified. */
export const makeClassifyProfile =
  (d: {
    profiles: ProfileReader;
    snapshots: SnapshotSource;
    embeddings: EmbeddingProvider;
    nicheVectors: () => Promise<Record<Niche, number[]>>;
    repository: ClassificationRepository;
    bus: EventBus;
    now: () => Date;
  }): ClassifyProfile =>
  async (profileId) => {
    const profile = await d.profiles.get(profileId);
    if (!profile) return err(new DomainError('NOT_FOUND', 'Perfil no encontrado'));
    const snapshot = await d.snapshots.getLatestSnapshot(profile.handle);
    if (!snapshot)
      return err(new DomainError('NOT_FOUND', 'El perfil aún no tiene snapshot de Instagram'));

    const features = extractFeatures(snapshot, profile.declared);
    const [[embedding], vectors] = await Promise.all([
      d.embeddings.embed([features.text]),
      d.nicheVectors(),
    ]);
    if (!embedding)
      return err(new DomainError('INTERNAL_ERROR', 'El proveedor no devolvió embedding'));

    const niches = classifyNiches({
      declared: declaredNiches(profile.declared),
      businessCategory: snapshot.businessCategory,
      hashtags: features.hashtags,
      text: features.text,
      similarities: Object.fromEntries(NICHES.map((n) => [n, cosine(embedding, vectors[n])])),
    });
    const classification: Classification = {
      niches,
      tier: features.tier,
      followers: features.followers,
      engagementRate: features.engagementRate,
      classifiedAt: d.now().toISOString(),
    };
    await d.repository.save(profileId, classification, embedding);
    d.bus.publish({ type: 'ProfileClassified', profileId });
    return ok(classification);
  };
