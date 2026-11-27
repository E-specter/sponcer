// Expone frontend y Supabase con quick tunnels de Cloudflare (ADR-007). Uso: npm run demo:tunnel -w backend
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';

const CLOUDFLARED = 'cloudflared@0.7.3';
// Configurable para convivir con otro proyecto que ya use 4321 en la misma PC.
const FRONTEND_PORT = Number(process.env.DEMO_FRONTEND_PORT ?? 4321);
const SUPABASE_PORT = 55521;
const BACKEND_HEALTH = 'http://127.0.0.1:3000/api/v1/health';
const TUNNEL_TIMEOUT_MS = 60_000;
const SERVER_TIMEOUT_MS = 60_000;
const CHECK_TIMEOUT_MS = 90_000;
const RETRY_DELAY_MS = 2_000;
const REQUEST_TIMEOUT_MS = 10_000;
const HTTP_OK = 200;
const EXIT_ERROR = 1;
const ROOT = new URL('../../', import.meta.url);
const IS_WINDOWS = process.platform === 'win32';

// URL de un quick tunnel en la salida de cloudflared.
// Coincide: "https://rapid-fox-1a2b.trycloudflare.com". No coincide: "https://api.cloudflare.com".
// Probar: https://regex101.com/?regex=https%3A%5C%2F%5C%2F%5Ba-z0-9-%5D%2B%5C.trycloudflare%5C.com&testString=https%3A%2F%2Frapid-fox-1a2b.trycloudflare.com
const TUNNEL_URL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

const children: ChildProcess[] = [];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const run = (cmd: string, args: string[], env: NodeJS.ProcessEnv = {}): ChildProcess => {
  const child = spawn(cmd, args, {
    cwd: ROOT,
    shell: IS_WINDOWS,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (cmd === 'npm') child.stderr?.pipe(process.stderr);
  children.push(child);
  return child;
};

// En Windows `child.kill()` no mata al árbol (npm -> node), de ahí taskkill /T.
const stop = (c: ChildProcess) => {
  if (c.pid === undefined || c.exitCode !== null) return;
  if (IS_WINDOWS) spawnSync('taskkill', ['/PID', String(c.pid), '/T', '/F']);
  else c.kill('SIGTERM');
};

let closing = false;
const shutdown = (code: number): never => {
  closing = true;
  children.forEach(stop);
  return process.exit(code);
};

const die = (msg: string): never => {
  console.error(`demo:tunnel: ${msg}`);
  return shutdown(EXIT_ERROR);
};

const openTunnel = (port: number): Promise<string> =>
  new Promise((resolve) => {
    const child = run('npx', ['--yes', CLOUDFLARED, 'tunnel', '--url', `http://127.0.0.1:${port}`]);
    const timer = setTimeout(
      () => die(`sin URL de túnel para :${port} tras ${TUNNEL_TIMEOUT_MS} ms`),
      TUNNEL_TIMEOUT_MS,
    );
    const onData = (chunk: Buffer) => {
      const url = TUNNEL_URL.exec(chunk.toString())?.[0];
      if (url === undefined) return;
      clearTimeout(timer);
      resolve(url);
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('exit', () => !closing && die(`cloudflared (:${port}) terminó antes de dar URL`));
  });

const status = async (url: string): Promise<number> =>
  fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    .then((r) => r.status)
    .catch(() => 0);

// Reintenta hasta `want` o agotar el plazo (el DNS del túnel tarda unos segundos).
const waitFor = async (url: string, want: number, timeoutMs: number): Promise<number> => {
  const got = await status(url);
  if (got === want || timeoutMs <= 0) return got;
  await sleep(RETRY_DELAY_MS);
  return waitFor(url, want, timeoutMs - RETRY_DELAY_MS);
};

const frontendUrl = await openTunnel(FRONTEND_PORT);
const supabaseUrl = await openTunnel(SUPABASE_PORT);

console.log('Recompilando frontend...');
const build = spawnSync('npm', ['run', 'build', '-w', 'frontend'], {
  cwd: ROOT,
  shell: IS_WINDOWS,
  stdio: 'inherit',
  env: {
    ...process.env,
    PUBLIC_API_MODE: 'http',
    PUBLIC_AUTH_MODE: 'supabase',
    PUBLIC_SUPABASE_URL: supabaseUrl,
    PUBLIC_DEMO_LOGIN: 'true',
    PUBLIC_SITE_URL: frontendUrl,
  },
});
if (build.status !== 0) die('falló la compilación del frontend');

if ((await status(BACKEND_HEALTH)) !== HTTP_OK) {
  run('npm', ['run', 'start', '-w', 'backend'], { APP_URL: frontendUrl }); // destino de los enlaces de invitación
  if ((await waitFor(BACKEND_HEALTH, HTTP_OK, SERVER_TIMEOUT_MS)) !== HTTP_OK)
    die('el backend no arrancó');
}
run('npm', ['run', 'start', '-w', 'frontend'], {
  HOST: '127.0.0.1', // Astro escucha solo en ::1 por defecto
  PORT: String(FRONTEND_PORT), // backend/.env trae PORT=3000 y Astro también lo lee
  PUBLIC_SITE_URL: frontendUrl, // origen público para el checkOrigin de Astro
});

const checks = [
  [`${frontendUrl}/`, 'frontend /'],
  [`${frontendUrl}/login`, 'frontend /login'],
  [`${supabaseUrl}/auth/v1/health`, 'supabase /auth/v1/health'],
] as const;
const DEMO_EMAIL = 'demo@sponcer.local';
const HTTP_SEE_OTHER = 303;
const COOKIE_SEPARATOR = '; ';

// Login demo real a través del túnel: POST con Origin del túnel y luego área autenticada.
const checkDemoLogin = async (): Promise<string[]> => {
  const post = await fetch(`${frontendUrl}/auth/demo-login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { Origin: frontendUrl, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email: DEMO_EMAIL }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const location = post.headers.get('location') ?? '';
  const cookies = post.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join(COOKIE_SEPARATOR);
  const page = await fetch(`${frontendUrl}/descubrir`, {
    redirect: 'manual',
    headers: { Cookie: cookies },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const errors = [
    post.status === HTTP_SEE_OTHER && location.endsWith('/descubrir')
      ? ''
      : `POST /auth/demo-login -> ${post.status} ${location} (esperado 303 /descubrir)`,
    page.status === HTTP_OK
      ? ''
      : `GET /descubrir con cookies -> ${page.status} ${page.headers.get('location') ?? ''} (esperado 200)`,
  ];
  return errors.filter((e) => e !== '');
};

const results = await Promise.all(
  checks.map(async ([url, label]) => ({
    label,
    code: await waitFor(url, HTTP_OK, CHECK_TIMEOUT_MS),
  })),
);
results.forEach((r) =>
  console.log(`${r.code === HTTP_OK ? 'ok   ' : 'FALLO'} ${r.label} -> ${r.code}`),
);
if (results.some((r) => r.code !== HTTP_OK)) die('las comprobaciones fallaron');

const loginErrors = await checkDemoLogin().catch((e: unknown) => [`excepción: ${String(e)}`]);
loginErrors.forEach((e) => console.log(`FALLO login demo: ${e}`));
if (loginErrors.length > 0) die('el login demo falló a través del túnel');
console.log('ok    login demo (POST 303 -> /descubrir 200)');

console.log(
  `\nComparte esta URL: ${frontendUrl}\n(Supabase público: ${supabaseUrl})\nCtrl+C para apagar.`,
);
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
