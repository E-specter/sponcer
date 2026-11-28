import { z } from 'zod';
import { City } from './catalogs';
import { Id, IsoDate } from './common';
import {
  DNI_LENGTH,
  MAX_DISPLAY_NAME,
  MAX_LEGAL_NAME,
  MAX_SHORT_TEXT,
  MIN_NAME,
  RUC_LENGTH,
} from './limits';

/** Tipo de cuenta exclusivo (ADR-009): se elige al registrarse y no cambia desde la app. */
export const AccountKind = z.enum(['company', 'influencer']);
export type AccountKind = z.infer<typeof AccountKind>;

export const PersonType = z.enum(['natural', 'juridica']);
export type PersonType = z.infer<typeof PersonType>;

export const DocumentType = z.enum(['dni', 'ruc']);
export type DocumentType = z.infer<typeof DocumentType>;

/** Versión de términos y política de privacidad aceptada en el registro (Ley 29733). */
export const CONSENT_VERSION = '2026-11-27';

/** Pesos SUNAT del dígito verificador: uno por cada uno de los 10 primeros dígitos del RUC. */
const RUC_WEIGHTS = '5432765432';
const RUC_MODULUS = 11;
const DECIMAL_BASE = 10;
/** Prefijo de RUC según tipo de persona. */
const RUC_PREFIX = { natural: '10', juridica: '20' } as const;

// Solo dígitos, longitud exacta. RUC: acepta "20100070970"; rechaza "2010007097" (10 dígitos) y "2010007097A".
// Probar: https://regex101.com/?regex=%5E%5Cd%7B11%7D%24&testString=20100070970&flavor=javascript
const RUC_REGEX = new RegExp(`^\\d{${RUC_LENGTH}}$`);
// DNI: acepta "45678912"; rechaza "4567891" (7 dígitos) y "4567891X".
// Probar: https://regex101.com/?regex=%5E%5Cd%7B8%7D%24&testString=45678912&flavor=javascript
const DNI_REGEX = new RegExp(`^\\d{${DNI_LENGTH}}$`);

/** RUC peruano: 11 dígitos con dígito verificador módulo 11 (SUNAT). */
export function isValidRuc(ruc: string): boolean {
  if (!RUC_REGEX.test(ruc)) return false;
  const body = ruc.slice(0, -1);
  const sum = [...body].reduce((acc, d, i) => acc + Number(RUC_WEIGHTS[i]) * Number(d), 0);
  const check = (RUC_MODULUS - (sum % RUC_MODULUS)) % DECIMAL_BASE;
  return check === Number(ruc.at(-1));
}

export const isValidDni = (dni: string): boolean => DNI_REGEX.test(dni);

/**
 * Persona natural: DNI o RUC que empieza con 10. Persona jurídica: RUC que empieza con 20.
 * Solo formato y dígito verificador; no se consulta a SUNAT ni RENIEC.
 */
export function documentError(
  personType: PersonType,
  documentType: DocumentType,
  documentNumber: string,
): string | null {
  if (documentType === 'dni') {
    if (personType === 'juridica') return 'Una persona jurídica se registra con RUC.';
    return isValidDni(documentNumber) ? null : `El DNI tiene ${DNI_LENGTH} dígitos.`;
  }
  if (!isValidRuc(documentNumber)) return `El RUC no es válido: revisa los ${RUC_LENGTH} dígitos.`;
  const prefix = RUC_PREFIX[personType];
  if (!documentNumber.startsWith(prefix)) {
    const who = personType === 'natural' ? 'una persona natural' : 'una persona jurídica';
    return `El RUC de ${who} empieza con ${prefix}.`;
  }
  return null;
}

const Name = z.string().trim().min(MIN_NAME).max(MAX_LEGAL_NAME);

export const CompanyInput = z
  .object({
    personType: PersonType,
    documentType: DocumentType,
    documentNumber: z.string().trim(),
    legalName: Name,
    tradeName: Name.optional(),
    city: City,
  })
  .superRefine((c, ctx) => {
    const message = documentError(c.personType, c.documentType, c.documentNumber);
    if (message) ctx.addIssue({ code: 'custom', path: ['documentNumber'], message });
  });
export type CompanyInput = z.infer<typeof CompanyInput>;

export const Company = z.object({
  id: Id,
  personType: PersonType,
  documentType: DocumentType,
  documentNumber: z.string(),
  legalName: z.string(),
  tradeName: z.string().nullable(),
  city: City,
  createdAt: IsoDate,
});
export type Company = z.infer<typeof Company>;

export const InfluencerInput = z.object({
  displayName: z.string().trim().min(MIN_NAME).max(MAX_DISPLAY_NAME),
  city: City,
  about: z.string().trim().max(MAX_SHORT_TEXT).optional(),
});
export type InfluencerInput = z.infer<typeof InfluencerInput>;

export const Influencer = z.object({
  displayName: z.string(),
  city: City,
  about: z.string().nullable(),
});
export type Influencer = z.infer<typeof Influencer>;

const Consent = {
  acceptTerms: z.literal(true),
  acceptPrivacy: z.literal(true),
  consentVersion: z.literal(CONSENT_VERSION),
};

/** Registro completo tras el primer enlace mágico. 409 CONFLICT si la cuenta ya está registrada. */
export const RegisterRequest = z.discriminatedUnion('accountKind', [
  z.object({ accountKind: z.literal('company'), company: CompanyInput, ...Consent }),
  z.object({ accountKind: z.literal('influencer'), influencer: InfluencerInput, ...Consent }),
]);
export type RegisterRequest = z.infer<typeof RegisterRequest>;

/** Datos de cuenta en `/me`. `accountKind: null` = registro pendiente (el frontend lleva al onboarding). */
export const Account = z.object({
  accountKind: AccountKind.nullable(),
  company: Company.nullable(),
  influencer: Influencer.nullable(),
});
export type Account = z.infer<typeof Account>;
