import { fixtureUsers } from '@sponcer/contracts/fixtures';
import type { InvitationSender } from '../../../application/ports/out/invitation-sender';

export const createMockInvitationSender = (): InvitationSender => ({
  invite: async (email) =>
    fixtureUsers.some((u) => u.email.toLowerCase() === email) ? 'already_registered' : 'sent',
});
