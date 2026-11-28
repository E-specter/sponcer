/** Cuentas sembradas para la demo pública (ADR-007, ADR-009). La contraseña vive solo en el servidor (DEMO_PASSWORD). */
export const DEMO_ACCOUNTS = [
  { email: 'demo@sponcer.local', label: 'Empresa demo (2 marcas)' },
  { email: 'demo-influencer@sponcer.local', label: 'Influencer demo' },
  { email: 'usuario1@sponcer.local', label: 'Usuario 1 (Influencer)' },
  { email: 'usuario2@sponcer.local', label: 'Usuario 2 (Empresa)' },
  { email: 'usuario3@sponcer.local', label: 'Usuario 3 (Influencer)' },
  { email: 'usuario4@sponcer.local', label: 'Usuario 4 (Empresa)' },
] as const;

export const isDemoEmail = (email: string): boolean => DEMO_ACCOUNTS.some((a) => a.email === email);
