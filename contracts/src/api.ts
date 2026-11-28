import { z } from 'zod';
import { RegisterRequest } from './schemas/accounts';
import { Claim, Me, StartClaimRequest, VerifyClaimResult } from './schemas/auth';
import {
  Campaign,
  CampaignQuery,
  CampaignsQuery,
  CreateCampaignRequest,
  UpdateCampaignRequest,
} from './schemas/campaigns';
import {
  RecordViewRequest,
  RecordViewResult,
  VisibilityItem,
  VisibilityQuery,
  VisibilitySummary,
  VisibilitySummaryQuery,
} from './schemas/visibility';
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
import {
  CreateQuoteRequest,
  CreateQuotesResult,
  Quote,
  QuotesQuery,
  TransitionQuoteRequest,
} from './schemas/quotes';
import {
  AdminAddProfileRequest,
  AdminEmailRequest,
  AdminEntry,
  AdminRemovalsQuery,
  Invitation,
  InviteUserRequest,
  RemovalRequestItem,
  ReviewRemovalRequest,
} from './schemas/admin';

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
  register: {
    method: 'post',
    path: '/api/v1/registration',
    summary:
      'Registro completo: tipo de cuenta (Empresa o Influencer), datos y consentimiento (ADR-009)',
    body: RegisterRequest,
    response: Me,
  },
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
    response: page(Match),
  },
  listQuotes: {
    method: 'get',
    path: '/api/v1/quotes',
    summary: 'Cotizaciones donde participa un perfil propio (RF-11)',
    query: QuotesQuery,
    response: page(Quote),
  },
  createQuote: {
    method: 'post',
    path: '/api/v1/quotes',
    summary: 'Cotiza a uno o varios influencers dentro de una campaña (no requiere match)',
    body: CreateQuoteRequest,
    response: CreateQuotesResult,
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
  adminListRemovals: {
    method: 'get',
    path: '/api/v1/admin/removal-requests',
    summary: 'Pedidos de exclusión para revisión (solo administradores)',
    query: AdminRemovalsQuery,
    response: page(RemovalRequestItem),
  },
  adminReviewRemoval: {
    method: 'post',
    path: '/api/v1/admin/removal-requests/:requestId/review',
    summary: 'Aplica o rechaza un pedido de exclusión (solo administradores)',
    body: ReviewRemovalRequest,
    response: RemovalRequestItem,
  },
  adminAddProfile: {
    method: 'post',
    path: '/api/v1/admin/profiles',
    summary:
      'Agrega una ficha previa ingiriendo un @handle profesional y público (solo administradores)',
    body: AdminAddProfileRequest,
    response: ProfileDetail,
  },
  adminInviteUser: {
    method: 'post',
    path: '/api/v1/admin/invitations',
    summary: 'Invita a una persona por correo con un enlace de acceso (solo administradores)',
    body: InviteUserRequest,
    response: Invitation,
  },
  adminListAdmins: {
    method: 'get',
    path: '/api/v1/admin/admins',
    summary: 'Lista los administradores (de ADMIN_EMAILS y nombrados en la app)',
    response: z.array(AdminEntry),
  },
  adminGrantAdmin: {
    method: 'post',
    path: '/api/v1/admin/admins',
    summary: 'Nombra administrador a un correo (solo administradores)',
    body: AdminEmailRequest,
    response: z.array(AdminEntry),
  },
  adminRevokeAdmin: {
    method: 'post',
    path: '/api/v1/admin/admins/revoke',
    summary:
      'Quita el rol de administrador nombrado en la app; no aplica a ADMIN_EMAILS ni al último admin',
    body: AdminEmailRequest,
    response: z.array(AdminEntry),
  },
  listCampaigns: {
    method: 'get',
    path: '/api/v1/campaigns',
    summary: 'Campañas de una marca propia con su avance',
    query: CampaignsQuery,
    response: page(Campaign),
  },
  getCampaign: {
    method: 'get',
    path: '/api/v1/campaigns/:campaignId',
    summary: 'Detalle de una campaña de una marca propia',
    query: CampaignQuery,
    response: Campaign,
  },
  createCampaign: {
    method: 'post',
    path: '/api/v1/campaigns',
    summary: 'Crea una campaña (temporada, general, segmento u otro) para una marca propia',
    body: CreateCampaignRequest,
    response: Campaign,
  },
  updateCampaign: {
    method: 'patch',
    path: '/api/v1/campaigns/:campaignId',
    summary: 'Edita una campaña o avanza su estado (borrador → activa → cerrada)',
    body: UpdateCampaignRequest,
    response: Campaign,
  },
  visibilitySummary: {
    method: 'get',
    path: '/api/v1/visibility/summary',
    summary: 'Contadores de intereses sin match y visitas de un perfil propio (7 y 30 días)',
    query: VisibilitySummaryQuery,
    response: VisibilitySummary,
  },
  visibility: {
    method: 'get',
    path: '/api/v1/visibility',
    summary: 'Quién mostró interés sin match o visitó un perfil propio',
    query: VisibilityQuery,
    response: page(VisibilityItem),
  },
  recordProfileView: {
    method: 'post',
    path: '/api/v1/profiles/:profileId/views',
    summary: 'Registra la visita de un perfil propio a una ficha (una por día)',
    body: RecordViewRequest,
    response: RecordViewResult,
  },
} as const satisfies Record<string, Endpoint>;

export type Api = typeof api;
export type EndpointName = keyof Api;
