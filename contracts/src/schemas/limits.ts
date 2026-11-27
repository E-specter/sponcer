// Límites de validación compartidos por backend y frontend. Cambiarlos es un cambio de contrato.

export const MAX_SHORT_TEXT = 280;
export const MAX_REASON_LENGTH = 500;
export const MAX_QUOTE_MESSAGE = 1000;
export const MAX_QUOTE_NOTE = 500;
export const MAX_CHAT_MESSAGE = 2000;

export const MAX_CREATOR_NICHES = 3;
export const MAX_BRAND_OBJECTIVES = 3;
export const MAX_BRAND_TARGET_NICHES = 5;
export const MAX_CLASSIFIED_NICHES = 3;
export const MAX_SERVICES = 20;
/** El proveedor de ingesta solo expone los últimos ~12 posts (ADR-001). */
export const MAX_SNAPSHOT_POSTS = 12;
export const MAX_MATCH_REASONS = 2;
/** Bio mostrada en la tarjeta del feed (se recorta en el servidor con "…"). */
export const MAX_CARD_BIO = 160;

export const MAX_PRICE_PEN = 1_000_000;
export const PAGE_LIMIT_DEFAULT = 20;
export const PAGE_LIMIT_MAX = 50;

export const FOLLOWERS_MICRO = 10_000;
export const FOLLOWERS_MID = 100_000;
export const FOLLOWERS_MACRO = 500_000;
export const FOLLOWERS_MEGA = 1_000_000;
/** Texto de búsqueda del feed (nombre, handle, bio, nichos). */
export const MAX_SEARCH_QUERY = 80;

// ---- F7 (ADR-009) ----
export const MIN_NAME = 2;
export const MAX_LEGAL_NAME = 120;
export const MAX_DISPLAY_NAME = 80;
export const RUC_LENGTH = 11;
export const DNI_LENGTH = 8;
export const MAX_CAMPAIGN_NAME = 80;
export const MAX_CAMPAIGN_CITIES = 5;
/** Influencers por cotización múltiple desde una campaña. */
export const MAX_BULK_QUOTES = 20;
/** Límite anti-abuso de cotizaciones por marca y por hora (ya no se exige match). */
export const QUOTES_PER_BRAND_PER_HOUR = 60;
