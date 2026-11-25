import type { ErrorCode } from '@sponcer/contracts';

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY = 429;
const HTTP_INTERNAL = 500;
const HTTP_BAD_GATEWAY = 502;

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: HTTP_BAD_REQUEST,
  UNAUTHORIZED: HTTP_UNAUTHORIZED,
  FORBIDDEN: HTTP_FORBIDDEN,
  NOT_FOUND: HTTP_NOT_FOUND,
  CONFLICT: HTTP_CONFLICT,
  RATE_LIMITED: HTTP_TOO_MANY,
  INVALID_TRANSITION: HTTP_UNPROCESSABLE,
  UPSTREAM_ERROR: HTTP_BAD_GATEWAY,
  INTERNAL_ERROR: HTTP_INTERNAL,
};

/** Error tipado del cliente de API (mismo código que `ErrorBody` del backend). */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = details;
  }
}
