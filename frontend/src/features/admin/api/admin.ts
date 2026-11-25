import type { RemovalStatus, ReviewRemovalRequest } from '@sponcer/contracts';
import { callBff } from '../../../lib/api/bff';

export const listRemovals = (status: RemovalStatus | undefined, cursor?: string) =>
  callBff('adminListRemovals', { query: { status, cursor } });

export const reviewRemoval = (requestId: string, body: ReviewRemovalRequest) =>
  callBff('adminReviewRemoval', { params: { requestId }, body });
