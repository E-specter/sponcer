// Datos semilla únicos para mocks de backend/frontend y seed de BD (ADR-004).
// Handles ficticios terminados en ".demo" para no aludir a cuentas reales.
// shortcut: los JSON se generaron con un script fuera del repo; si hacen falta más perfiles, editar los JSON a mano.
import { z } from 'zod';
import { Declared, Service } from '../src/schemas/profiles';
import { IgProfileSnapshot } from '../src/schemas/instagram';
import { ProfileRole, ProfileStatus } from '../src/schemas/catalogs';
import { Id, IsoDate } from '../src/schemas/common';
import { Message, Notification } from '../src/schemas/messaging';
import { QuoteRecord } from '../src/schemas/quotes';
import profilesJson from './profiles.json';
import usersJson from './users.json';
import socialJson from './social.json';

export const FixtureUser = z.object({ id: Id, email: z.email(), name: z.string() });
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
  quotes: z.array(QuoteRecord),
  notifications: z.array(Notification.extend({ userId: Id })),
});
export type FixtureSocial = z.infer<typeof FixtureSocial>;

// Se validan al cargar: un fixture inválido rompe los tests en vez de colarse en un mock.
export const fixtureUsers = z.array(FixtureUser).parse(usersJson);
export const fixtureProfiles = z.array(FixtureProfile).parse(profilesJson);
export const fixtureSocial = FixtureSocial.parse(socialJson);

/** Usuario con el que corre el modo mock (dueño de un perfil creador y uno marca). */
export const demoUser = fixtureUsers[0]!;
