import { expect } from '@playwright/test';
import { MAILPIT_URL } from './env';

const MAIL_TIMEOUT_MS = 20_000;

interface MessageSummary {
  ID: string;
  To: { Address: string }[];
  Created: string;
}

interface MessageDetail {
  Text: string;
  HTML: string;
}

// Enlace del correo: plantillas de F6 (`/auth/callback?token_hash=...&type=...`) o, sin ellas, el de verificación de
// Supabase (`/auth/v1/verify?token=...`). Hasta el primer espacio, comilla o ">".
// Acepta "http://localhost:4421/auth/callback?token_hash=abc&type=email" y "http://127.0.0.1:55521/auth/v1/verify?token=abc";
// rechaza "http://127.0.0.1/otra/ruta".
// Probar: https://regex101.com/?regex=https%3F%3A%5C%2F%5C%2F%5B%5E%5Cs%22%3C%3E%5D%2B%5C%2Fauth%5C%2F%28callback%5C%3Ftoken_hash%7Cv1%5C%2Fverify%29%5B%5E%5Cs%22%3C%3E%5D%2B&testString=http%3A%2F%2Flocalhost%3A4421%2Fauth%2Fcallback%3Ftoken_hash%3Dabc%26type%3Demail&flavor=javascript
const VERIFY_LINK = /https?:\/\/[^\s"<>]+\/auth\/(?:callback\?token_hash|v1\/verify)[^\s"<>]+/;
// Entidad HTML del "&" dentro de un href. Acepta "a&amp;b"; rechaza "a&b" (ya decodificado).
// Probar: https://regex101.com/?regex=%26amp%3B&testString=a%26amp%3Bb&flavor=javascript
const HTML_AMPERSAND = /&amp;/g;

/** Id del último correo de Mailpit para `email`, o `undefined` si aún no llegó. */
async function latestIdFor(email: string): Promise<string | undefined> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/messages`);
  const { messages } = (await res.json()) as { messages: MessageSummary[] };
  return messages
    .filter((m) => m.To.some((t) => t.Address.toLowerCase() === email.toLowerCase()))
    .sort((a, b) => b.Created.localeCompare(a.Created))[0]?.ID;
}

/** Espera el correo del enlace mágico de `email` y devuelve su URL de verificación. */
export async function magicLinkFor(email: string): Promise<string> {
  const id = await expect
    .poll(() => latestIdFor(email), { message: `correo para ${email}`, timeout: MAIL_TIMEOUT_MS })
    .toBeTruthy()
    .then(() => latestIdFor(email));
  const detail = (await (
    await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)
  ).json()) as MessageDetail;
  const found = VERIFY_LINK.exec(`${detail.Text}\n${detail.HTML}`)?.[0];
  if (!found) throw new Error('El correo no trae un enlace de verificación');
  return found.replace(HTML_AMPERSAND, '&');
}
