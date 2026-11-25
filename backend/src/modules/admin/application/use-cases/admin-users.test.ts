import { describe, expect, it } from 'vitest';
import { createAdminDirectory, createInMemoryAdminStore } from '../../../../shared/admin';
import { makeAdminUsers } from './admin-users';

const FORBIDDEN_CALLS = 4;
const TWO_ADMINS = 2;
const NOW = new Date('2026-01-01T10:00:00Z');
const setup = (env: string[]) => {
  const admins = createAdminDirectory(env, createInMemoryAdminStore());
  const sent: string[] = [];
  const uc = makeAdminUsers({
    admins,
    invites: {
      invite: async (e) => {
        sent.push(e);
        return e.startsWith('ya') ? 'already_registered' : 'sent';
      },
    },
    now: () => NOW,
  });
  return { uc, sent, admins };
};

describe('administradores', () => {
  it('un no admin recibe FORBIDDEN en todo', async () => {
    const { uc, sent } = setup(['a@x.pe']);
    const rs = [
      await uc.list('x@x.pe'),
      await uc.grant('x@x.pe', 'y@x.pe'),
      await uc.revoke('x@x.pe', 'a@x.pe'),
      await uc.invite('x@x.pe', 'n@x.pe'),
    ];
    expect(rs.map((r) => !r.ok && r.error.code)).toEqual(Array(FORBIDDEN_CALLS).fill('FORBIDDEN'));
    expect(sent).toEqual([]);
  });

  it('grant es idempotente y devuelve la lista completa (env primero)', async () => {
    const { uc } = setup(['a@x.pe']);
    await uc.grant('A@x.pe', 'B@x.pe');
    const r = await uc.grant('a@x.pe', 'b@x.pe');
    expect(r.ok && r.value).toEqual([
      { email: 'a@x.pe', source: 'env', grantedAt: null, grantedBy: null },
      { email: 'b@x.pe', source: 'app', grantedAt: NOW.toISOString(), grantedBy: 'a@x.pe' },
    ]);
    const again = await uc.grant('a@x.pe', 'a@x.pe');
    expect(again.ok && again.value).toHaveLength(TWO_ADMINS);
  });

  it('un admin nombrado puede revocar; el admin de env no se revoca', async () => {
    const { uc } = setup(['a@x.pe']);
    await uc.grant('a@x.pe', 'b@x.pe');
    const env = await uc.revoke('b@x.pe', 'a@x.pe');
    expect(!env.ok && env.error.code).toBe('CONFLICT');
    const r = await uc.revoke('b@x.pe', 'b@x.pe');
    expect(r.ok && r.value.map((a) => a.email)).toEqual(['a@x.pe']);
    const gone = await uc.list('b@x.pe');
    expect(!gone.ok && gone.error.code).toBe('FORBIDDEN');
  });

  it('ultimo admin (solo app): CONFLICT; correo ajeno: NOT_FOUND', async () => {
    const { uc, admins } = setup([]);
    await admins.grant('solo@x.pe', 'bd', NOW);
    const last = await uc.revoke('solo@x.pe', 'solo@x.pe');
    expect(!last.ok && last.error.code).toBe('CONFLICT');
    const nf = await uc.revoke('solo@x.pe', 'otro@x.pe');
    expect(!nf.ok && nf.error.code).toBe('NOT_FOUND');
  });

  it('invitar normaliza el correo y refleja already_registered', async () => {
    const { uc, sent } = setup(['a@x.pe']);
    const r = await uc.invite('a@x.pe', ' Ya@X.pe ');
    expect(r.ok && r.value).toEqual({
      email: 'ya@x.pe',
      status: 'already_registered',
      invitedAt: NOW.toISOString(),
    });
    expect(sent).toEqual(['ya@x.pe']);
  });
});
