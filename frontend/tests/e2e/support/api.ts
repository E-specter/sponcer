import { CONSENT_VERSION } from '@sponcer/contracts';
import type {
  Campaign,
  Claim,
  CreateQuotesResult,
  Declared,
  InteractionResult,
  Message,
  ProfileDetail,
  ServiceInput,
  Quote,
  VerifyClaimResult,
} from '@sponcer/contracts';
import { API_URL } from './env';

const HTTP_OK_MAX = 299;
const DATE_LENGTH = 10;
const HTTP_TOO_MANY_REQUESTS = 429;
/** El limitador por IP de la API (reclamos: 30/min) se alcanza con una suite rápida: se espera y se reintenta. */
const RETRY_DELAY_MS = 4000;
const MAX_RETRIES = 20;

/** RUC de persona jurídica (prefijo 20) con dígito verificador válido y cuerpo aleatorio: el documento es único. */
const RUC_WEIGHTS = '5432765432';
const RUC_BODY_SPAN = 90_000_000;
const RUC_BODY_BASE = 10_000_000;
export function randomRuc(): string {
  const body = `20${RUC_BODY_BASE + Math.floor(Math.random() * RUC_BODY_SPAN)}`;
  const sum = [...body].reduce((acc, d, i) => acc + Number(RUC_WEIGHTS[i]) * Number(d), 0);
  return `${body}${(11 - (sum % 11)) % 10}`;
}
const CONSENT = {
  acceptTerms: true,
  acceptPrivacy: true,
  consentVersion: CONSENT_VERSION,
} as const;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface ApiReply<T> {
  status: number;
  ok: boolean;
  body: T;
}

/** Cliente fino de la core API con el JWT del usuario. Solo para PREPARAR datos o comprobar permisos. */
export function apiAs(token: string | null) {
  const call = async <T>(
    method: string,
    path: string,
    body?: unknown,
    attempt = 0,
  ): Promise<ApiReply<T>> => {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === HTTP_TOO_MANY_REQUESTS && attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS);
      return call<T>(method, path, body, attempt + 1);
    }
    const json = (await res.json().catch(() => null)) as T;
    return { status: res.status, ok: res.status <= HTTP_OK_MAX, body: json };
  };
  const must = async <T>(p: Promise<ApiReply<T>>, what: string): Promise<T> => {
    const r = await p;
    if (!r.ok) throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  /** ADR-009: sin registro no se reclama. Empresa para marcas, Influencer para creadores; no repite si ya hay tipo. */
  const ensureRegistered = async (role: 'creator' | 'brand'): Promise<void> => {
    const me = await must(
      call<{ account: { accountKind: string | null } }>('GET', '/api/v1/me'),
      'me',
    );
    if (me.account.accountKind) return;
    await must(
      call<unknown>(
        'POST',
        '/api/v1/registration',
        role === 'brand'
          ? {
              accountKind: 'company',
              company: {
                personType: 'juridica',
                documentType: 'ruc',
                documentNumber: randomRuc(),
                legalName: 'Empresa E2E S.A.C.',
                city: 'lima',
              },
              ...CONSENT,
            }
          : {
              accountKind: 'influencer',
              influencer: { displayName: 'Influencer E2E', city: 'lima' },
              ...CONSENT,
            },
      ),
      'register',
    );
  };
  return {
    call,
    ensureRegistered,
    /** Reclama y verifica un handle (la ingesta mock inyecta el código en la bio al iniciar el reclamo). */
    async claim(handle: string, role: 'creator' | 'brand'): Promise<string> {
      await ensureRegistered(role);
      const claim = await must(
        call<Claim>('POST', '/api/v1/claims', { handle, role }),
        'startClaim',
      );
      const result = await must(
        call<VerifyClaimResult>('POST', `/api/v1/claims/${claim.claimId}/verify`),
        'verifyClaim',
      );
      if (result.status !== 'verified') throw new Error(`verifyClaim: ${result.status}`);
      return result.profileId;
    },
    declared: (profileId: string, declared: Declared) =>
      must(
        call<ProfileDetail>('PATCH', `/api/v1/profiles/${profileId}/declared`, declared),
        'updateDeclared',
      ),
    services: (profileId: string, req: { services: ServiceInput[] }) =>
      must(call<unknown>('PUT', `/api/v1/profiles/${profileId}/services`, req), 'putServices'),
    profile: (handle: string) =>
      must(call<ProfileDetail>('GET', `/api/v1/profiles/${handle}`), 'getProfile'),
    interest: (actorProfileId: string, targetProfileId: string) =>
      must(
        call<InteractionResult>('POST', '/api/v1/interactions', {
          actorProfileId,
          targetProfileId,
          kind: 'interest',
        }),
        'interact',
      ),
    sendMessage: (matchId: string, senderProfileId: string, body: string) =>
      must(
        call<Message>('POST', `/api/v1/matches/${matchId}/messages`, { senderProfileId, body }),
        'sendMessage',
      ),
    /** Campaña activa para una marca (ADR-009). */
    createCampaign: (brandProfileId: string, name = 'Campaña E2E') =>
      must(
        call<Campaign>('POST', '/api/v1/campaigns', {
          brandProfileId,
          name,
          kind: 'general',
          startsOn: new Date().toISOString().slice(0, DATE_LENGTH),
          activate: true,
        }),
        'createCampaign',
      ),
    /** Cotiza a un creador dentro de una campaña nueva y activa; devuelve la cotización creada. */
    async createQuote(
      requesterProfileId: string,
      creatorProfileId: string,
      serviceId: string | undefined,
      message: string,
    ): Promise<Quote> {
      const campaign = await must(
        call<Campaign>('POST', '/api/v1/campaigns', {
          brandProfileId: requesterProfileId,
          name: 'Campaña E2E',
          kind: 'general',
          startsOn: new Date().toISOString().slice(0, DATE_LENGTH),
          activate: true,
        }),
        'createCampaign',
      );
      const out = await must(
        call<CreateQuotesResult>('POST', '/api/v1/quotes', {
          requesterProfileId,
          campaignId: campaign.id,
          targets: [{ creatorProfileId, serviceId }],
          message,
          send: true,
        }),
        'createQuote',
      );
      const [created] = out.created;
      if (!created) throw new Error(`createQuote: ${JSON.stringify(out.failed)}`);
      return created;
    },
  };
}
