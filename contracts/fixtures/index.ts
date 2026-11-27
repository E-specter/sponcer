// Datos semilla únicos para mocks de backend/frontend y seed de BD (ADR-004).
// Handles ficticios terminados en ".demo" para no aludir a cuentas reales.
// shortcut: los JSON se generaron con un script fuera del repo; si hacen falta más perfiles, editar los JSON a mano.
import { z } from 'zod';
import { Declared, Service } from '../src/schemas/profiles';
import { IgProfileSnapshot } from '../src/schemas/instagram';
import { ProfileRole, ProfileStatus } from '../src/schemas/catalogs';
import { Id, IsoDate } from '../src/schemas/common';
import { AccountKind, Company, Influencer } from '../src/schemas/accounts';
import { Campaign } from '../src/schemas/campaigns';
import { Message, Notification } from '../src/schemas/messaging';
import { QuoteRecord } from '../src/schemas/quotes';
import profilesJson from './profiles.json';
import usersJson from './users.json';
import socialJson from './social.json';

/** Cada usuario tiene un solo tipo de cuenta (ADR-009): Empresa con perfiles `brand` o Influencer con perfiles `creator`. */
export const FixtureUser = z.object({
  id: Id,
  email: z.email(),
  name: z.string(),
  accountKind: AccountKind,
  company: Company.nullable(),
  influencer: Influencer.nullable(),
});
export type FixtureUser = z.infer<typeof FixtureUser>;

export const FixtureProfile = z.object({
  id: Id,
  role: ProfileRole,
  status: ProfileStatus,
  ownerUserId: Id.nullable(),
  snapshot: IgProfileSnapshot,
  declared: Declared.nullable(),
  services: z.array(Service),
});
export type FixtureProfile = z.infer<typeof FixtureProfile>;

export const FixtureInteraction = z.object({
  id: Id,
  actorProfileId: Id,
  targetProfileId: Id,
  kind: z.enum(['interest', 'dismiss']),
  createdAt: IsoDate,
});

export const FixtureMatch = z.object({
  id: Id,
  creatorProfileId: Id,
  brandProfileId: Id,
  createdAt: IsoDate,
});

export const FixtureSocial = z.object({
  interactions: z.array(FixtureInteraction),
  matches: z.array(FixtureMatch),
  messages: z.array(Message),
  campaigns: z.array(Campaign.omit({ stats: true })),
  quotes: z.array(QuoteRecord),
  notifications: z.array(Notification.extend({ userId: Id })),
});
export type FixtureSocial = z.infer<typeof FixtureSocial>;

// Se validan al cargar: un fixture inválido rompe los tests en vez de colarse en un mock.
export const fixtureUsers = z.array(FixtureUser).parse(usersJson);
export const fixtureProfiles = z.array(FixtureProfile).parse(profilesJson);
export const fixtureSocial = FixtureSocial.parse(socialJson);

/** Empresa demo con la que corre el modo mock: dueña de las marcas @rumbo.viajes.demo y @andina.snacks.demo. */
export const demoUser = fixtureUsers[0]!;
/** Influencer demo: dueña de @sofi.moda.demo, con match, chat y cotización con @rumbo.viajes.demo. */
export const demoInfluencer = fixtureUsers[1]!;
