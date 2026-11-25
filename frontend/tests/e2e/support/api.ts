import type {
  Claim,
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
const HTTP_TOO_MANY_REQUESTS = 429;
/** El limitador por IP de la API (reclamos: 30/min) se alcanza con una suite rápida: se espera y se reintenta. */
const RETRY_DELAY_MS = 4000;
const MAX_RETRIES = 20;

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
  return {
    call,
    /** Reclama y verifica un handle (la ingesta mock inyecta el código en la bio al iniciar el reclamo). */
    async claim(handle: string, role: 'creator' | 'brand'): Promise<string> {
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
    createQuote: (requesterProfileId: string, serviceId: string, message: string) =>
      must(
        call<Quote>('POST', '/api/v1/quotes', {
          requesterProfileId,
          serviceId,
          message,
          send: true,
        }),
        'createQuote',
      ),
  };
}
