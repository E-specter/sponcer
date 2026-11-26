/** Usuario autenticado de la request (lo pone el middleware del slice auth en `res.locals.user`). */
export interface AuthUser {
  userId: string;
  email: string;
  /** `false` si el correo no está verificado; ausente = sin dato (mock). */
  emailConfirmed?: boolean;
}
