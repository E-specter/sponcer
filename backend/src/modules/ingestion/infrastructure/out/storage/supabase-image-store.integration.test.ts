// Sube y borra un objeto real en el bucket `profile-images` de Supabase local. Se omite sin SUPABASE_URL.
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { BUCKET, createSupabaseImageStore } from './supabase-image-store';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HANDLE_SUFFIX_LENGTH = 8;
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

describe.skipIf(!url || !key)('SupabaseImageStore (Storage local)', () => {
  it('sube, sirve por URL pública y borra la carpeta del handle', async () => {
    const db = createClient(url ?? 'http://unused', key ?? 'unused', {
      auth: { persistSession: false },
    });
    const handle = `it_img_${randomUUID().slice(0, HANDLE_SUFFIX_LENGTH)}.demo`;
    const fetchFn = (async () =>
      new Response(Buffer.from(PNG), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })) as typeof fetch;
    const store = createSupabaseImageStore({ db, fetchFn });
    try {
      const publicUrl = await store.store(handle, 'https://cdn.example/a.png');
      expect(publicUrl).toContain(`/${BUCKET}/${handle}/`);
      const served = await fetch(publicUrl!);
      expect(served.status).toBe(200);
      expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG);
    } finally {
      await store.deleteAll(handle);
    }
    const left = await db.storage.from(BUCKET).list(handle);
    expect(left.data).toEqual([]);
  });
});
