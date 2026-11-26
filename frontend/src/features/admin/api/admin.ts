import type {
  AdminAddProfileRequest,
  RemovalStatus,
  ReviewRemovalRequest,
} from '@sponcer/contracts';
import { callBff } from '../../../lib/api/bff';

export const listRemovals = (status: RemovalStatus | undefined, cursor?: string) =>
  callBff('adminListRemovals', { query: { status, cursor } });

export const reviewRemoval = (requestId: string, body: ReviewRemovalRequest) =>
  callBff('adminReviewRemoval', { params: { requestId }, body });

export const addProfile = (body: AdminAddProfileRequest) => callBff('adminAddProfile', { body });

export const inviteUser = (email: string) => callBff('adminInviteUser', { body: { email } });

export const listAdmins = () => callBff('adminListAdmins');

export const grantAdmin = (email: string) => callBff('adminGrantAdmin', { body: { email } });

export const revokeAdmin = (email: string) => callBff('adminRevokeAdmin', { body: { email } });
