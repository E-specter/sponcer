import { describe, expect, it } from 'vitest';
import {
  api,
  CLAIM_CODE_REGEX,
  CLAIM_MAX_ATTEMPTS_PER_HOUR,
  CLAIM_TTL_MINUTES,
  CONSENT_VERSION,
} from '@sponcer/contracts';
import { demoInfluencer, demoUser, fixtureProfiles } from '@sponcer/contracts/fixtures';
import {
  buildTestApp,
  call,
  claimsPath,
  demoBrand,
  demoCreator,
  expectError,
  expectMatchesContract,
  OTHER_COMPANY,
  OTHER_USER,
  profilePath,
  removalPath,
  STATUS,
  type TestApp,
  UNKNOWN_UUID,
  unclaimedCreator,
  unclaimedPersonalAccount,
  verifyPath,
} from '../support/app';

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const IG_HANDLE_MAX_LENGTH = 30;
const IP_LIMIT_PER_MINUTE = 30;
const PAST_EXPIRY_MINUTES = 2;
const TTL_MS = CLAIM_TTL_MINUTES * MS_PER_MINUTE;
const JUST_BEFORE_EXPIRY = CLAIM_TTL_MINUTES - 1;

type Ctx = TestApp;

async function startClaim(
  t: Ctx,
  userId: string,
  handle: string,
  role: 'creator' | 'brand' = 'creator',
) {
  const res = await call(t.app, 'post', claimsPath, userId, { handle, role });
  expect(res.status, JSON.stringify(res.body)).toBe(STATUS.OK);
  return res.body as { claimId: string; handle: string; code: string; expiresAt: string };
}

const verify = (t: Ctx, userId: string | null, claimId: string) =>
  call(t.app, 'post', verifyPath(claimId), userId);

describe('GET /me', () => {
  it('401 UNAUTHORIZED sin token', async () => {
    expectError(
      await call((await buildTestApp()).app, 'get', api.me.path, null),
      STATUS.UNAUTHORIZED,
      'UNAUTHORIZED',
    );
  });

  it('401 con un token que no corresponde a ningún usuario', async () => {
    const res = await call((await buildTestApp()).app, 'get', api.me.path, UNKNOWN_UUID);
    expectError(res, STATUS.UNAUTHORIZED, 'UNAUTHORIZED');
  });

  it('200 con el usuario y solo sus perfiles (multiperfil, RF-04)', async () => {
    const res = await call((await buildTestApp()).app, 'get', api.me.path, demoUser.id);
    expect(res.status).toBe(STATUS.OK);
    expectMatchesContract(api.me, res.body);
    expect(res.body.account.accountKind).toBe('company');
    const mine = fixtureProfiles.filter((p) => p.ownerUserId === demoUser.id).map((p) => p.id);
    expect(res.body.profiles.map((p: { id: string }) => p.id).sort()).toEqual(mine.sort());
    expect(res.body.email).toBe(demoUser.email);
  });

  it('no mezcla perfiles de otros usuarios', async () => {
    const res = await call((await buildTestApp()).app, 'get', api.me.path, OTHER_USER.id);
    expectMatchesContract(api.me, res.body);
    expect(res.body.profiles.map((p: { id: string }) => p.id)).not.toContain(demoBrand.id);
  });
});

describe('POST /claims (startClaim)', () => {
  it('401 sin token', async () => {
    const res = await call((await buildTestApp()).app, 'post', claimsPath, null, {
      handle: 'abc',
      role: 'creator',
    });
    expectError(res, STATUS.UNAUTHORIZED, 'UNAUTHORIZED');
  });

  it('200: devuelve un código con la forma de ADR-002 y vigencia de 30 min', async () => {
    const t = await buildTestApp();
    const res = await call(t.app, 'post', claimsPath, demoInfluencer.id, {
      handle: unclaimedCreator.snapshot.handle,
      role: 'creator',
    });
    expect(res.status).toBe(STATUS.OK);
    expectMatchesContract(api.startClaim, res.body);
    expect(res.body.code).toMatch(CLAIM_CODE_REGEX);
    expect(
      new Date(res.body.expiresAt).getTime() - new Date('2026-01-01T10:00:00Z').getTime(),
    ).toBe(TTL_MS);
  });

  it('normaliza el handle (@, mayúsculas, espacios) antes de guardarlo', async () => {
    const res = await call((await buildTestApp()).app, 'post', claimsPath, demoUser.id, {
      handle: '  @Mi.Handle_X ',
      role: 'brand',
    });
    expect(res.status).toBe(STATUS.OK);
    expect(res.body.handle).toBe('mi.handle_x');
  });

  it('cada reclamo genera un código distinto', async () => {
    const t = await buildTestApp();
    const a = await startClaim(t, demoInfluencer.id, 'handle.uno');
    const b = await startClaim(t, demoInfluencer.id, 'handle.dos');
    expect(a.code).not.toBe(b.code);
    expect(a.claimId).not.toBe(b.claimId);
  });

  it.each([
    ['handle vacío', { handle: '', role: 'creator' }],
    ['handle con espacio', { handle: 'con espacio', role: 'creator' }],
    [
      'handle de más de 30 caracteres',
      { handle: 'a'.repeat(IG_HANDLE_MAX_LENGTH + 1), role: 'creator' },
    ],
    ['rol inexistente', { handle: 'abc', role: 'admin' }],
    ['sin rol', { handle: 'abc' }],
    ['cuerpo vacío', {}],
    ['handle booleano', { handle: true, role: 'creator' }],
  ])('400 VALIDATION_ERROR con %s', async (_name, body) => {
    const res = await call((await buildTestApp()).app, 'post', claimsPath, demoInfluencer.id, body);
    expectError(res, STATUS.BAD_REQUEST, 'VALIDATION_ERROR');
  });

  it('400 con JSON mal formado', async () => {
    const t = await buildTestApp();
    const res = await call(t.app, 'post', claimsPath, demoInfluencer.id)
      .set('Content-Type', 'application/json')
      .send('{"handle":');
    expectError(res, STATUS.BAD_REQUEST, 'VALIDATION_ERROR');
  });
});

describe('reglas por tipo de cuenta en POST /claims (ADR-009)', () => {
  it('400 VALIDATION_ERROR si el rol no corresponde al tipo de cuenta', async () => {
    const t = await buildTestApp();
    const asCompany = await call(t.app, 'post', claimsPath, demoUser.id, {
      handle: 'handle.cruzado',
      role: 'creator',
    });
    const asInfluencer = await call(t.app, 'post', claimsPath, demoInfluencer.id, {
      handle: 'handle.cruzado',
      role: 'brand',
    });
    expectError(asCompany, STATUS.BAD_REQUEST, 'VALIDATION_ERROR');
    expectError(asInfluencer, STATUS.BAD_REQUEST, 'VALIDATION_ERROR');
  });
});

describe('POST /registration', () => {
  const consent = { acceptTerms: true, acceptPrivacy: true, consentVersion: CONSENT_VERSION };
  const influencer = {
    accountKind: 'influencer',
    influencer: { displayName: 'Otra Persona', city: 'lima' },
    ...consent,
  };

  it('401 sin token', async () => {
    const res = await call((await buildTestApp()).app, 'post', api.register.path, null, influencer);
    expectError(res, STATUS.UNAUTHORIZED, 'UNAUTHORIZED');
  });

  it('409 CONFLICT si la cuenta ya está registrada', async () => {
    const res = await call(
      (await buildTestApp()).app,
      'post',
      api.register.path,
      demoUser.id,
      influencer,
    );
    expectError(res, STATUS.CONFLICT, 'CONFLICT');
  });

  it('400 sin aceptar los términos o con un RUC inválido', async () => {
    const t = await buildTestApp();
    const noTerms = await call(t.app, 'post', api.register.path, demoUser.id, {
      ...influencer,
      acceptTerms: false,
    });
    const badRuc = await call(t.app, 'post', api.register.path, demoUser.id, {
      accountKind: 'company',
      company: {
        personType: 'juridica',
        documentType: 'ruc',
        documentNumber: '20100070971',
        legalName: 'Empresa Falsa',
        city: 'lima',
      },
      ...consent,
    });
    expectError(noTerms, STATUS.BAD_REQUEST, 'VALIDATION_ERROR');
    expectError(badRuc, STATUS.BAD_REQUEST, 'VALIDATION_ERROR');
  });
});

describe('POST /claims/:claimId/verify (verifyClaim)', () => {
  it('401 sin token', async () => {
    expectError(
      await verify(await buildTestApp(), null, UNKNOWN_UUID),
      STATUS.UNAUTHORIZED,
      'UNAUTHORIZED',
    );
  });

  it('404 con un claimId inexistente', async () => {
    expectError(
      await verify(await buildTestApp(), demoInfluencer.id, UNKNOWN_UUID),
      STATUS.NOT_FOUND,
      'NOT_FOUND',
    );
  });

  it('404 (y no 403) si el reclamo es de otro usuario: no revela que existe', async () => {
    const t = await buildTestApp();
    const claim = await startClaim(t, demoInfluencer.id, 'handle.privado');
    expectError(await verify(t, OTHER_USER.id, claim.claimId), STATUS.NOT_FOUND, 'NOT_FOUND');
  });

  it('verified: vincula el perfil nuevo, lo expone en /me', async () => {
    const t = await buildTestApp();
    const handle = unclaimedCreator.snapshot.handle;
    const claim = await startClaim(t, OTHER_USER.id, handle);
    const res = await verify(t, OTHER_USER.id, claim.claimId);
    expect(res.status).toBe(STATUS.OK);
    expectMatchesContract(api.verifyClaim, res.body);
    expect(res.body).toEqual({ status: 'verified', profileId: unclaimedCreator.id });
    expect(t.events).toEqual([
      { type: 'ProfileVerified', igHandle: handle, userId: OTHER_USER.id, role: 'creator' },
    ]);
    const me = await call(t.app, 'get', api.me.path, OTHER_USER.id);
    expect(me.body.profiles.map((p: { handle: string }) => p.handle)).toContain(handle);
  });

  it('verified reclama la ficha previa sin duplicarla (ADR-002 paso 4)', async () => {
    const t = await buildTestApp();
    const claim = await startClaim(t, demoInfluencer.id, unclaimedCreator.snapshot.handle);
    await verify(t, demoInfluencer.id, claim.claimId);
    const me = await call(t.app, 'get', api.me.path, demoInfluencer.id);
    const same = me.body.profiles.filter(
      (p: { handle: string }) => p.handle === unclaimedCreator.snapshot.handle,
    );
    expect(same).toHaveLength(1);
  });

  it('verified para un handle sin ficha previa crea el perfil', async () => {
    const t = await buildTestApp();
    const claim = await startClaim(t, demoUser.id, 'marca.recien.llegada', 'brand');
    const res = await verify(t, demoUser.id, claim.claimId);
    expect(res.body.status).toBe('verified');
    const me = await call(t.app, 'get', api.me.path, demoUser.id);
    expect(me.body.profiles).toContainEqual(
      expect.objectContaining({ handle: 'marca.recien.llegada', role: 'brand' }),
    );
  });

  it('el código se invalida tras verificar: un segundo verify es 404', async () => {
    const t = await buildTestApp();
    const claim = await startClaim(t, demoInfluencer.id, 'handle.una.vez');
    expect((await verify(t, demoInfluencer.id, claim.claimId)).body.status).toBe('verified');
    expectError(await verify(t, demoInfluencer.id, claim.claimId), STATUS.NOT_FOUND, 'NOT_FOUND');
  });

  it('code_not_found: si otro reclamo del mismo handle reemplazó el código en la bio', async () => {
    const t = await buildTestApp();
    const first = await startClaim(t, demoInfluencer.id, 'handle.disputado');
    await startClaim(t, OTHER_USER.id, 'handle.disputado');
    const res = await verify(t, demoInfluencer.id, first.claimId);
    expect(res.status).toBe(STATUS.OK);
    expectMatchesContract(api.verifyClaim, res.body);
    expect(res.body).toEqual({ status: 'code_not_found' });
    expect(t.events).toEqual([]);
  });

  it('expired: pasada la vigencia de 30 min, y aún vale un minuto antes', async () => {
    const t = await buildTestApp();
    const late = await startClaim(t, demoInfluencer.id, 'handle.tarde');
    const punctual = await startClaim(t, OTHER_USER.id, 'handle.puntual');
    t.advanceMinutes(JUST_BEFORE_EXPIRY);
    expect((await verify(t, OTHER_USER.id, punctual.claimId)).body).toEqual({
      status: 'verified',
      profileId: expect.any(String),
    });
    t.advanceMinutes(PAST_EXPIRY_MINUTES);
    const res = await verify(t, demoInfluencer.id, late.claimId);
    expectMatchesContract(api.verifyClaim, res.body);
    expect(res.body).toEqual({ status: 'expired' });
  });

  it('not_eligible/not_professional: la cuenta no es profesional', async () => {
    const t = await buildTestApp();
    const claim = await startClaim(t, demoInfluencer.id, unclaimedPersonalAccount.snapshot.handle);
    const res = await verify(t, demoInfluencer.id, claim.claimId);
    expectMatchesContract(api.verifyClaim, res.body);
    expect(res.body).toEqual({ status: 'not_eligible', reason: 'not_professional' });
  });

  it('already_owned: el perfil ya tiene otro dueño (no se roba)', async () => {
    const t = await buildTestApp();
    const claim = await startClaim(t, OTHER_COMPANY.id, demoBrand.snapshot.handle, 'brand');
    const res = await verify(t, OTHER_COMPANY.id, claim.claimId);
    expectMatchesContract(api.verifyClaim, res.body);
    expect(res.body).toEqual({ status: 'already_owned' });
    expect(t.events).toEqual([]);
    const owner = await call(
      t.app,
      'get',
      `/api/v1/profiles/${demoBrand.snapshot.handle}`,
      demoUser.id,
    );
    expect(owner.body.isOwner).toBe(true);
  });

  it('429 RATE_LIMITED tras 5 intentos en una hora (RF-02, RNF-04)', async () => {
    const t = await buildTestApp();
    const claim = await startClaim(t, demoInfluencer.id, 'handle.disputado');
    await startClaim(t, OTHER_USER.id, 'handle.disputado');
    const attempts = Array.from({ length: CLAIM_MAX_ATTEMPTS_PER_HOUR }, () => claim.claimId);
    const results = await Promise.all(
      attempts.map(() => verify(t, demoInfluencer.id, claim.claimId)),
    );
    expect(results.every((r) => r.status === STATUS.OK)).toBe(true);
    expectError(await verify(t, demoInfluencer.id, claim.claimId), STATUS.TOO_MANY, 'RATE_LIMITED');
  });

  it('el límite es por usuario: otro usuario sigue pudiendo verificar', async () => {
    const t = await buildTestApp();
    const mine = await startClaim(t, demoInfluencer.id, 'handle.disputado');
    await startClaim(t, OTHER_USER.id, 'handle.disputado');
    await Promise.all(
      Array.from({ length: CLAIM_MAX_ATTEMPTS_PER_HOUR }, () =>
        verify(t, demoInfluencer.id, mine.claimId),
      ),
    );
    const theirs = await startClaim(t, OTHER_USER.id, 'otro.handle');
    expect((await verify(t, OTHER_USER.id, theirs.claimId)).status).toBe(STATUS.OK);
  });

  it('el límite se libera pasada la hora', async () => {
    const t = await buildTestApp();
    const claim = await startClaim(t, demoInfluencer.id, 'handle.disputado');
    await startClaim(t, OTHER_USER.id, 'handle.disputado');
    await Promise.all(
      Array.from({ length: CLAIM_MAX_ATTEMPTS_PER_HOUR }, () =>
        verify(t, demoInfluencer.id, claim.claimId),
      ),
    );
    t.advanceMinutes(MINUTES_PER_HOUR + 1);
    // el reclamo ya caducó, pero ya no está bloqueado por el límite: responde expired, no 429
    expect((await verify(t, demoInfluencer.id, claim.claimId)).body).toEqual({ status: 'expired' });
  });
});

describe('re-verificación F1-A2 (M-2, M-5)', () => {
  it('M-2: una ficha libre con otro rol se reclama con el rol del usuario y sin datos declarados ajenos', async () => {
    const t = await buildTestApp();
    const handle = unclaimedCreator.snapshot.handle;
    const claim = await startClaim(t, demoUser.id, handle, 'brand');
    const res = await verify(t, demoUser.id, claim.claimId);
    expect(res.body).toEqual({ status: 'verified', profileId: expect.any(String) });
    const profile = await call(t.app, 'get', profilePath(handle), demoUser.id);
    expect(profile.body).toMatchObject({ role: 'brand', isOwner: true, declared: null });
  });

  it('M-2: una ficha retirada devuelve not_eligible/removed, no already_owned', async () => {
    const t = await buildTestApp();
    const handle = demoCreator.snapshot.handle;
    await call(t.app, 'post', removalPath(handle), demoInfluencer.id, {
      email: demoInfluencer.email,
    });
    const claim = await startClaim(t, OTHER_USER.id, handle);
    const res = await verify(t, OTHER_USER.id, claim.claimId);
    expectMatchesContract(api.verifyClaim, res.body);
    expect(res.body).toEqual({ status: 'not_eligible', reason: 'removed' });
  });

  it('M-5: más de 30 POST /claims por minuto desde la misma IP dan 429 con ErrorBody', async () => {
    const t = await buildTestApp();
    const body = { handle: 'handle.spam', role: 'creator' };
    const burst = await Promise.all(
      Array.from({ length: IP_LIMIT_PER_MINUTE + 1 }, () =>
        call(t.app, 'post', claimsPath, demoInfluencer.id, body),
      ),
    );
    expect(burst.filter((r) => r.status === STATUS.OK)).toHaveLength(IP_LIMIT_PER_MINUTE);
    const limited = burst.find((r) => r.status === STATUS.TOO_MANY)!;
    expectError(limited, STATUS.TOO_MANY, 'RATE_LIMITED');
  });

  it('M-5: el límite por IP también cubre verify y se libera con una app nueva', async () => {
    const t = await buildTestApp();
    const burst = await Promise.all(
      Array.from({ length: IP_LIMIT_PER_MINUTE + 1 }, () =>
        verify(t, demoInfluencer.id, UNKNOWN_UUID),
      ),
    );
    expect(burst.filter((r) => r.status === STATUS.TOO_MANY)).toHaveLength(1);
    expect((await verify(await buildTestApp(), demoInfluencer.id, UNKNOWN_UUID)).status).toBe(
      STATUS.NOT_FOUND,
    );
  });

  it('M-1: tras 5 verificaciones el sexto da 429 por usuario y no llega a leer la bio', async () => {
    const t = await buildTestApp();
    const claim = await startClaim(t, demoInfluencer.id, 'handle.disputado');
    await startClaim(t, OTHER_USER.id, 'handle.disputado');
    const results = await Promise.all(
      Array.from({ length: CLAIM_MAX_ATTEMPTS_PER_HOUR + 1 }, () =>
        verify(t, demoInfluencer.id, claim.claimId),
      ),
    );
    expect(results.filter((r) => r.status === STATUS.OK)).toHaveLength(CLAIM_MAX_ATTEMPTS_PER_HOUR);
    expect(results.filter((r) => r.status === STATUS.TOO_MANY)).toHaveLength(1);
  });
});
