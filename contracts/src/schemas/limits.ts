// Límites de validación compartidos por backend y frontend. Cambiarlos es un cambio de contrato.

export const MAX_SHORT_TEXT = 280;
export const MAX_CITY_LENGTH = 60;
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

export const MAX_PRICE_PEN = 1_000_000;
export const PAGE_LIMIT_DEFAULT = 20;
export const PAGE_LIMIT_MAX = 50;

export const FOLLOWERS_MICRO = 10_000;
export const FOLLOWERS_MID = 100_000;
export const FOLLOWERS_MACRO = 500_000;
export const FOLLOWERS_MEGA = 1_000_000;
