import { z } from 'zod';
import { Claim, Me, StartClaimRequest, VerifyClaimResult } from './schemas/auth';
import { PageQuery, page } from './schemas/common';
import {
  FeedItem,
  FeedQuery,
  InteractionRequest,
  InteractionResult,
  Match,
  MatchesQuery,
} from './schemas/matching';
import { Message, MessagesQuery, Notification, SendMessageRequest } from './schemas/messaging';
import {
  Declared,
  ProfileDetail,
  PutServicesRequest,
  RemovalRequest,
  Service,
} from './schemas/profiles';
import { CreateQuoteRequest, Quote, QuotesQuery, TransitionQuoteRequest } from './schemas/quotes';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch';

export interface Endpoint {
  method: HttpMethod;
  /** Ruta Express (`:param`). */
  path: string;
  summary: string;
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType;
  /** `false` = público. Por defecto requiere `Authorization: Bearer <jwt de Supabase>`. */
  auth?: boolean;
}

const Ok = z.object({ ok: z.literal(true) });

/** Registro único de endpoints: genera `openapi.json`, valida en backend y tipa el cliente del frontend. */
export const api = {
  health: {
    method: 'get',
    path: '/api/v1/health',
    summary: 'Salud del servicio',
    response: z.object({ status: z.literal('ok') }),
    auth: false,
  },
  me: { method: 'get', path: '/api/v1/me', summary: 'Usuario actual y sus perfiles', response: Me },
  startClaim: {
    method: 'post',
    path: '/api/v1/claims',
    summary: 'Inicia el reclamo de un @handle y devuelve el código para la bio (RF-02)',
    body: StartClaimRequest,
    response: Claim,
  },
  verifyClaim: {
    method: 'post',
    path: '/api/v1/claims/:claimId/verify',
    summary: 'Verifica el código en la bio con una lectura en vivo (ADR-002)',
    response: VerifyClaimResult,
  },
  getProfile: {
    method: 'get',
    path: '/api/v1/profiles/:handle',
    summary: 'Ficha completa (RF-01, RF-06). Ingiere bajo demanda si no existe',
    response: ProfileDetail,
  },
  updateDeclared: {
    method: 'patch',
    path: '/api/v1/profiles/:profileId/declared',
    summary: 'Reemplaza los datos declarados del perfil propio (RF-05, RF-08)',
    body: Declared,
    response: ProfileDetail,
  },
  putServices: {
    method: 'put',
    path: '/api/v1/profiles/:profileId/services',
    summary: 'Reemplaza el catálogo de servicios del creador (RF-07)',
    body: PutServicesRequest,
    response: z.array(Service),
  },
  requestRemoval: {
    method: 'post',
    path: '/api/v1/profiles/:handle/removal-requests',
    summary: 'Pedido de exclusión y borrado del titular (Ley 29733)',
    body: RemovalRequest,
    response: Ok,
    auth: false,
  },
  feed: {
    method: 'get',
    path: '/api/v1/feed',
    summary: 'Feed de tarjetas ordenado por compatibilidad (RF-10)',
    query: FeedQuery,
    response: page(FeedItem),
  },
  interact: {
    method: 'post',
    path: '/api/v1/interactions',
    summary: 'Interés o descarte; interés mutuo crea un match',
    body: InteractionRequest,
    response: InteractionResult,
  },
  matches: {
    method: 'get',
    path: '/api/v1/matches',
    summary: 'Matches de un perfil propio (RF-11)',
    query: MatchesQuery,
    response: z.array(Match),
  },
  listQuotes: {
    method: 'get',
    path: '/api/v1/quotes',
    summary: 'Cotizaciones donde participa un perfil propio (RF-11)',
    query: QuotesQuery,
    response: z.array(Quote),
  },
  createQuote: {
    method: 'post',
    path: '/api/v1/quotes',
    summary: 'Solicita una cotización sobre un servicio (no requiere match)',
    body: CreateQuoteRequest,
    response: Quote,
  },
  transitionQuote: {
    method: 'post',
    path: '/api/v1/quotes/:quoteId/transitions',
    summary: 'Cambia el estado de una cotización según QUOTE_TRANSITIONS',
    body: TransitionQuoteRequest,
    response: Quote,
  },
  notifications: {
    method: 'get',
    path: '/api/v1/notifications',
    summary: 'Notificaciones del usuario (RF-12)',
    query: PageQuery,
    response: page(Notification),
  },
  markNotificationRead: {
    method: 'post',
    path: '/api/v1/notifications/:notificationId/read',
    summary: 'Marca una notificación como leída',
    response: Notification,
  },
  listMessages: {
    method: 'get',
    path: '/api/v1/matches/:matchId/messages',
    summary: 'Historial del chat de un match, más reciente primero (RF-13)',
    query: MessagesQuery,
    response: page(Message),
  },
  sendMessage: {
    method: 'post',
    path: '/api/v1/matches/:matchId/messages',
    summary: 'Envía un mensaje; la entrega en vivo va por Supabase Realtime',
    body: SendMessageRequest,
    response: Message,
  },
} as const satisfies Record<string, Endpoint>;

export type Api = typeof api;
export type EndpointName = keyof Api;
