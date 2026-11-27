import { randomUUID } from 'node:crypto';
import { CLAIM_MAX_ATTEMPTS_PER_HOUR, type Account } from '@sponcer/contracts';
import { fixtureProfiles, fixtureUsers } from '@sponcer/contracts/fixtures';
import { DomainError } from '../../../../../shared/errors';
import { ok } from '../../../../../shared/result';
import type { ClaimRecord } from '../../../domain/claim';
import type { AccountStore } from '../../../application/ports/out/account-store';
import type { ClaimStore } from '../../../application/ports/out/claim-store';
import type { IdentityProvider } from '../../../application/ports/out/identity-provider';
import type { LiveBioReader } from '../../../application/ports/out/live-bio-reader';

const MOCK_BEARER_PREFIX = /^bearer mock:/i; // el esquema HTTP no distingue mayúsculas
const HOUR_MS = 3_600_000;

/** Acepta `Authorization: Bearer mock:<userId>` de un usuario de fixtures. */
export const createMockIdentityProvider = (): IdentityProvider => ({
  async authenticate(header) {
    if (!header || !MOCK_BEARER_PREFIX.test(header)) return null;
    const userId = header.replace(MOCK_BEARER_PREFIX, '').trim();
    const user = fixtureUsers.find((u) => u.id === userId);
    return user ? { userId: user.id, email: user.email } : null;
  },
});

export const createInMemoryClaimStore = (): ClaimStore => {
  const claims = new Map<string, ClaimRecord>();
  const attempts: Array<{ userId: string; at: Date }> = [];
  return {
    // Como la PK de la BD: un id repetido es un conflicto, no una sobrescritura.
    save: async (c) => {
      if (claims.has(c.id))
        throw new DomainError('CONFLICT', 'Ya existe un registro con esos datos');
      claims.set(c.id, c);
    },
    findById: async (id) => claims.get(id) ?? null,
    async markConsumed(id) {
      const c = claims.get(id);
      if (c) claims.set(id, { ...c, consumed: true });
    },
    // Síncrono dentro de un solo tick: cuenta+registra sin que otra petición se intercale.
    tryRecordAttempt: async (userId, now) => {
      const since = now.getTime() - HOUR_MS;
      const used = attempts.filter((a) => a.userId === userId && a.at.getTime() >= since).length;
      if (used >= CLAIM_MAX_ATTEMPTS_PER_HOUR) return false;
      attempts.push({ userId, at: now });
      return true;
    },
  };
};

/**
 * ADR-002 en modo mock: bio semilla del fixture + el código pendiente del handle.
 * Handles fuera de fixtures: perfil profesional público genérico.
 * `pendingCodes` lo llena el módulo al iniciar un reclamo (el store solo guarda hashes).
 */
export const createMockLiveBioReader = (pendingCodes: Map<string, string>): LiveBioReader => ({
  async read(handle) {
    const snap = fixtureProfiles.find((f) => f.snapshot.handle === handle)?.snapshot;
    const seedBio = snap?.biography ?? '';
    const code = pendingCodes.get(handle) ?? '';
    return ok({
      biography: `${seedBio} ${code}`.trim(),
      isPrivate: snap?.isPrivate ?? false,
      isBusiness: snap?.isBusiness ?? true,
    });
  },
});

const documentTaken = (type: string) =>
  new DomainError('CONFLICT', `Ya existe una empresa registrada con ese ${type.toUpperCase()}`, {
    reason: 'document_taken',
  });

/** Cuentas en memoria sembradas desde `contracts/fixtures` (todas registradas). */
export const createInMemoryAccountStore = (now: () => Date = () => new Date()): AccountStore => {
  const accounts = new Map<string, Account>(
    fixtureUsers.map((u) => [
      u.id,
      { accountKind: u.accountKind, company: u.company, influencer: u.influencer },
    ]),
  );
  return {
    get: async (userId) =>
      accounts.get(userId) ?? { accountKind: null, company: null, influencer: null },
    async register(userId, req) {
      if (accounts.has(userId))
        throw new DomainError('CONFLICT', 'Esta cuenta ya está registrada', {
          reason: 'already_registered',
        });
      if (req.accountKind === 'influencer') {
        const { displayName, city, about } = req.influencer;
        accounts.set(userId, {
          accountKind: 'influencer',
          company: null,
          influencer: { displayName, city, about: about ?? null },
        });
        return;
      }
      const { documentNumber, documentType, tradeName, ...rest } = req.company;
      if ([...accounts.values()].some((a) => a.company?.documentNumber === documentNumber))
        throw documentTaken(documentType);
      accounts.set(userId, {
        accountKind: 'company',
        company: {
          ...rest,
          documentType,
          documentNumber,
          tradeName: tradeName ?? null,
          id: randomUUID(),
          createdAt: now().toISOString(),
        },
        influencer: null,
      });
    },
  };
};
