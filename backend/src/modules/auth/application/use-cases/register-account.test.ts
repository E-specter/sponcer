import { describe, expect, it } from 'vitest';
import { CONSENT_VERSION, type RegisterRequest } from '@sponcer/contracts';
import { demoUser } from '@sponcer/contracts/fixtures';
import { ok } from '../../../../shared/result';
import { createInMemoryAccountStore } from '../../infrastructure/out/mock/mock-adapters';
import { makeRegisterAccount } from './register-account';

const NOW = new Date('2026-11-27T10:00:00Z');
const consent = {
  acceptTerms: true,
  acceptPrivacy: true,
  consentVersion: CONSENT_VERSION,
} as const;
const company = (documentNumber: string): RegisterRequest => ({
  accountKind: 'company',
  company: {
    personType: 'juridica',
    documentType: 'ruc',
    documentNumber,
    legalName: 'Nueva Empresa S.A.C.',
    city: 'lima',
  },
  ...consent,
});
const influencer: RegisterRequest = {
  accountKind: 'influencer',
  influencer: { displayName: 'Nueva Influencer', city: 'cusco' },
  ...consent,
};

function setup() {
  const accounts = createInMemoryAccountStore(() => NOW);
  const getCurrentUser = async (u: { userId: string; email: string }) =>
    ok({ ...u, account: await accounts.get(u.userId), profiles: [], isAdmin: false });
  return { accounts, register: makeRegisterAccount({ accounts, getCurrentUser }) };
}
const newUser = () => ({ userId: crypto.randomUUID(), email: 'nuevo@sponcer.local' });

describe('registro', () => {
  it('antes de registrarse la cuenta está pendiente', async () => {
    const { accounts } = setup();
    expect(await accounts.get(newUser().userId)).toEqual({
      accountKind: null,
      company: null,
      influencer: null,
    });
  });

  it('registra una empresa nueva y a un influencer', async () => {
    const { register } = setup();
    const c = await register(newUser(), company('20601030013'));
    expect(c.ok && c.value.account).toMatchObject({
      accountKind: 'company',
      company: { documentNumber: '20601030013', tradeName: null, createdAt: NOW.toISOString() },
      influencer: null,
    });
    const i = await register(newUser(), influencer);
    expect(i.ok && i.value.account).toMatchObject({
      accountKind: 'influencer',
      company: null,
      influencer: { displayName: 'Nueva Influencer', about: null },
    });
  });

  it('409 si la cuenta ya está registrada', async () => {
    const { register } = setup();
    const r = await register({ userId: demoUser.id, email: demoUser.email }, influencer);
    expect(!r.ok && [r.error.code, r.error.details]).toEqual([
      'CONFLICT',
      { reason: 'already_registered' },
    ]);
  });

  it('documento duplicado: CONFLICT con mensaje claro y sin dejar la cuenta registrada', async () => {
    const { accounts, register } = setup();
    const taken = demoUser.company!.documentNumber;
    const user = newUser();
    const r = await register(user, company(taken));
    expect(!r.ok && [r.error.code, r.error.message]).toEqual([
      'CONFLICT',
      'Ya existe una empresa registrada con ese RUC',
    ]);
    expect((await accounts.get(user.userId)).accountKind).toBeNull();
  });
});
