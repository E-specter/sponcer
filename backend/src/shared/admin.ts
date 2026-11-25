/** `adminEmails` ya viene en minúsculas desde `loadEnv`. */
export const isAdminEmail = (adminEmails: readonly string[], email: string): boolean =>
  adminEmails.includes(email.trim().toLowerCase());
