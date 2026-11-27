import type { VisibilityKind } from '@sponcer/contracts';
import { callBff } from '../../../lib/api/bff';

export const loadSummary = (profileId: string) =>
  callBff('visibilitySummary', { query: { profileId } });

export const loadVisibility = (profileId: string, kind: VisibilityKind, cursor?: string) =>
  callBff('visibility', { query: { profileId, kind, cursor } });
