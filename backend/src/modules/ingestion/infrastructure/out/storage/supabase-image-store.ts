import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../../../../../shared/logger';
import type { ImageStore } from '../../../application/ports/out/image-store';

export const BUCKET = 'profile-images';
const MAX_IMAGE_BYTES = 5_000_000;
const DOWNLOAD_TIMEOUT_MS = 10_000;
const HASH_LENGTH = 16;
const LIST_LIMIT = 1000;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

/** `profile-images/<handle>/<sha256-corto>.<ext>`: contenido idéntico = mismo objeto (upsert idempotente). */
export const objectPath = (handle: string, bytes: Uint8Array, ext: string): string =>
  `${handle}/${createHash('sha256').update(bytes).digest('hex').slice(0, HASH_LENGTH)}.${ext}`;

export function createSupabaseImageStore(deps: {
  db: SupabaseClient;
  fetchFn?: typeof fetch;
}): ImageStore {
  const doFetch = deps.fetchFn ?? fetch;
  const bucket = () => deps.db.storage.from(BUCKET);

  async function download(url: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
    if (new URL(url).protocol !== 'https:') return null;
    const res = await doFetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    const mime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (!res.ok || !EXTENSIONS[mime] || declared > MAX_IMAGE_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return bytes.length > 0 && bytes.length <= MAX_IMAGE_BYTES ? { bytes, mime } : null;
  }

  return {
    async store(handle, sourceUrl) {
      if (!sourceUrl) return null;
      try {
        const image = await download(sourceUrl);
        if (!image) {
          logger.warn(`foto de @${handle} descartada (respuesta, tipo o tamaño no válidos)`);
          return null;
        }
        const path = objectPath(handle, image.bytes, EXTENSIONS[image.mime]!);
        const { error } = await bucket().upload(path, image.bytes, {
          contentType: image.mime,
          upsert: true,
        });
        if (error) {
          logger.warn(`no se pudo subir la foto de @${handle}`, error.message);
          return null;
        }
        return bucket().getPublicUrl(path).data.publicUrl;
      } catch (e) {
        logger.warn(`no se pudo copiar la foto de @${handle}`, String(e));
        return null;
      }
    },
    async deleteAll(handle) {
      const listed = await bucket().list(handle, { limit: LIST_LIMIT });
      if (listed.error) throw new Error(`image-store list: ${listed.error.message}`);
      if (!listed.data.length) return;
      const removed = await bucket().remove(listed.data.map((o) => `${handle}/${o.name}`));
      if (removed.error) throw new Error(`image-store remove: ${removed.error.message}`);
    },
  };
}
