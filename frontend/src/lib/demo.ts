/** Cuentas sembradas para la demo pública (ADR-007). La contraseña vive solo en el servidor (DEMO_PASSWORD). */
export const DEMO_ACCOUNTS = [
  { email: 'demo@sponcer.local', label: 'Demo (marca y creadora)' },
  { email: 'usuario1@sponcer.local', label: 'Usuario 1' },
  { email: 'usuario2@sponcer.local', label: 'Usuario 2' },
  { email: 'usuario3@sponcer.local', label: 'Usuario 3' },
  { email: 'usuario4@sponcer.local', label: 'Usuario 4' },
] as const;

export const isDemoEmail = (email: string): boolean => DEMO_ACCOUNTS.some((a) => a.email === email);
