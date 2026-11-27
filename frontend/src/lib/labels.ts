import type {
  Account,
  CampaignKind,
  CampaignStatus,
  BrandSector,
  CampaignObjective,
  City,
  Niche,
  QuoteStatus,
  ScoreComponent,
  ServiceFormat,
  ServiceType,
  Tier,
} from '@sponcer/contracts';

export const CITY_LABEL: Record<City, string> = {
  lima: 'Lima',
  arequipa: 'Arequipa',
  trujillo: 'Trujillo',
  chiclayo: 'Chiclayo',
  piura: 'Piura',
  cusco: 'Cusco',
  iquitos: 'Iquitos',
  huancayo: 'Huancayo',
  tacna: 'Tacna',
  ica: 'Ica',
  juliaca: 'Juliaca',
  puno: 'Puno',
  pucallpa: 'Pucallpa',
  chimbote: 'Chimbote',
  cajamarca: 'Cajamarca',
  ayacucho: 'Ayacucho',
  huaraz: 'Huaraz',
  tarapoto: 'Tarapoto',
  otra: 'Otra ciudad',
};

export const NICHE_LABEL: Record<Niche, string> = {
  moda: 'Moda',
  belleza: 'Belleza',
  fitness: 'Fitness',
  deportes: 'Deportes',
  gastronomia: 'Gastronomía',
  viajes: 'Viajes',
  tecnologia: 'Tecnología',
  gaming: 'Gaming',
  musica: 'Música',
  entretenimiento: 'Entretenimiento',
  educacion: 'Educación',
  finanzas: 'Finanzas',
  'salud-bienestar': 'Salud y bienestar',
  'familia-maternidad': 'Familia y maternidad',
  mascotas: 'Mascotas',
  'arte-diseno': 'Arte y diseño',
  emprendimiento: 'Emprendimiento',
  'hogar-deco': 'Hogar y decoración',
  automotriz: 'Automotriz',
  lifestyle: 'Lifestyle',
};

export const SECTOR_LABEL: Record<BrandSector, string> = {
  'moda-retail': 'Moda y retail',
  'belleza-cuidado-personal': 'Belleza y cuidado personal',
  'alimentos-bebidas': 'Alimentos y bebidas',
  restaurantes: 'Restaurantes',
  tecnologia: 'Tecnología',
  salud: 'Salud',
  educacion: 'Educación',
  'finanzas-seguros': 'Finanzas y seguros',
  'turismo-hoteleria': 'Turismo y hotelería',
  'entretenimiento-medios': 'Entretenimiento y medios',
  deporte: 'Deporte',
  hogar: 'Hogar',
  automotriz: 'Automotriz',
  servicios: 'Servicios',
  otro: 'Otro',
};

export const TIER_LABEL: Record<Tier, string> = {
  nano: 'Nano',
  micro: 'Micro',
  mid: 'Medio',
  macro: 'Macro',
  mega: 'Mega',
};

export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  'publicacion-patrocinada': 'Publicación patrocinada',
  canje: 'Canje',
  embajador: 'Embajador de marca',
  evento: 'Evento',
  'contenido-ugc': 'Contenido UGC',
};

export const SERVICE_FORMAT_LABEL: Record<ServiceFormat, string> = {
  post: 'Post',
  reel: 'Reel',
  story: 'Story',
  live: 'Live',
  combo: 'Combo',
};

export const OBJECTIVE_LABEL: Record<CampaignObjective, string> = {
  reconocimiento: 'Reconocimiento',
  interaccion: 'Interacción',
  ventas: 'Ventas',
  lanzamiento: 'Lanzamiento',
  'trafico-web': 'Tráfico web',
  comunidad: 'Comunidad',
};

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  negotiating: 'En negociación',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

/** Texto del botón que lleva la cotización al estado indicado. */
export const QUOTE_ACTION_LABEL: Record<QuoteStatus, string> = {
  draft: 'Volver a borrador',
  sent: 'Enviar',
  negotiating: 'Negociar',
  accepted: 'Aceptar',
  rejected: 'Rechazar',
  completed: 'Marcar completada',
  cancelled: 'Cancelar',
};

export const REASON_LABEL: Record<ScoreComponent, string> = {
  niches: 'Comparten nichos',
  similarity: 'Contenido similar',
  budget: 'Encaja con tu presupuesto o tarifas',
  engagement: 'Buena interacción con su audiencia',
};

const numberFormat = new Intl.NumberFormat('es-PE', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const moneyFormat = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
  maximumFractionDigits: 0,
});
const dateFormat = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Lima',
});

export const formatCount = (n: number): string => numberFormat.format(n);
export const formatPen = (n: number): string => moneyFormat.format(n);
export const formatDate = (iso: string): string => dateFormat.format(new Date(iso));
export const formatPercent = (n: number): string => `${n.toFixed(1)} %`;

export const CAMPAIGN_KIND_LABEL: Record<CampaignKind, string> = {
  season: 'Temporada',
  general: 'General',
  segment: 'Segmento',
  other: 'Otro',
};

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: 'Borrador',
  active: 'Activa',
  closed: 'Cerrada',
};

/** Nombre del perfil según su rol: "marca" (de una Empresa) o "influencer". */
export const ROLE_LABEL = { brand: 'Marca', creator: 'Influencer' } as const;

/** Nombre a mostrar de la cuenta: nombre comercial o razón social de la Empresa; nombre del Influencer. */
export const accountName = (a: Account, fallback: string): string =>
  a.company?.tradeName ?? a.company?.legalName ?? a.influencer?.displayName ?? fallback;

export const ACCOUNT_KIND_LABEL = { company: 'Empresa', influencer: 'Influencer' } as const;
/** Tipo de perfil que administra cada tipo de cuenta (ADR-009). */
export const ROLE_OF_ACCOUNT = { company: 'brand', influencer: 'creator' } as const;
