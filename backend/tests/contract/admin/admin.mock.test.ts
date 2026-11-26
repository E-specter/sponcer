import { describe } from 'vitest';
import { fixtureUsers } from '@sponcer/contracts/fixtures';
import { createMockInvitationSender } from '../../../src/modules/admin/infrastructure/out/mock/mock-invitation-sender';
import { describeInvitationSenderContract } from './invitation-sender.contract';

let n = 0;
describe('admin · InvitationSender mock', () => {
  describeInvitationSenderContract(createMockInvitationSender, {
    knownEmail: () => fixtureUsers[0]!.email.toLowerCase(),
    freshEmail: () => `nuevo${n++}@correo.pe`,
  });
});
