// Fija DEMO_PASSWORD a las cuentas sembradas *@sponcer.local (no crea usuarios). Idempotente.
// Uso: npm run demo:accounts -w backend
export {}; // fuerza modo módulo (await de nivel superior)
const DEMO_DOMAIN = '@sponcer.local';
const PAGE_SIZE = 1000;
const EXIT_ERROR = 1;
const MIN_PASSWORD_LENGTH = 6;

const fail = (msg: string): never => {
  console.error(`demo:accounts: ${msg}`);
  return process.exit(EXIT_ERROR);
};

const need = (name: string): string => process.env[name] ?? fail(`falta ${name} en backend/.env`);

const baseUrl = need('SUPABASE_URL');
const serviceKey = need('SUPABASE_SERVICE_ROLE_KEY');
const password = need('DEMO_PASSWORD');
if (password.length < MIN_PASSWORD_LENGTH) {
  fail(`DEMO_PASSWORD debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
}

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
};

type AdminUser = { id: string; email?: string };

const listRes = await fetch(`${baseUrl}/auth/v1/admin/users?per_page=${PAGE_SIZE}`, { headers });
if (!listRes.ok) fail(`no se pudo listar usuarios (HTTP ${listRes.status})`);
const { users } = (await listRes.json()) as { users: AdminUser[] };
const demo = users.filter((u) => u.email?.endsWith(DEMO_DOMAIN));
if (demo.length === 0) fail(`no hay usuarios ${DEMO_DOMAIN}; ejecuta el seed (npm run db:reset)`);

const updated = await Promise.all(
  demo.map(async (u) => {
    const res = await fetch(`${baseUrl}/auth/v1/admin/users/${u.id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ password }),
    });
    return res.ok
      ? { email: u.email, ok: true }
      : { email: u.email, ok: false, status: res.status };
  }),
);

updated.forEach((r) =>
  console.log(r.ok ? `ok   ${r.email}` : `FALLO ${r.email} (HTTP ${r.status})`),
);
if (updated.some((r) => !r.ok)) process.exit(EXIT_ERROR);
console.log(`${updated.length} cuentas actualizadas`);
