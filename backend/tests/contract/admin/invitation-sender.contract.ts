import { expect, it } from 'vitest';
import type { InvitationSender } from '../../../src/modules/admin/application/ports/out/invitation-sender';

/** Suite del puerto InvitationSender: la pasan el adaptador mock y el de Supabase (misma semántica). */
export function describeInvitationSenderContract(
  make: () => InvitationSender,
  data: { knownEmail: () => string; freshEmail: () => string },
): void {
  it('correo sin cuenta: sent', async () => {
    expect(await make().invite(data.freshEmail())).toBe('sent');
  });

  it('correo con cuenta: already_registered', async () => {
    expect(await make().invite(data.knownEmail())).toBe('already_registered');
  });
}
