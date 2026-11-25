import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { BUCKET, createSupabaseImageStore, objectPath } from './supabase-image-store';

const PNG = new Uint8Array([137, 80, 78, 71]);
const OVERSIZE = '99999999';
const PUBLIC = 'http://storage.test/public';

const image = (type: string, body: Uint8Array = PNG, extra: Record<string, string> = {}) =>
  new Response(Buffer.from(body), { status: 200, headers: { 'content-type': type, ...extra } });

function setup(response: () => Promise<Response>, uploadError: string | null = null) {
  const upload = vi.fn(async () => ({ error: uploadError ? { message: uploadError } : null }));
  const remove = vi.fn(async () => ({ error: null }));
  const list = vi.fn(async () => ({ data: [{ name: 'a.png' }, { name: 'b.jpg' }], error: null }));
  const getPublicUrl = vi.fn((p: string) => ({ data: { publicUrl: `${PUBLIC}/${p}` } }));
  const from = vi.fn(() => ({ upload, remove, list, getPublicUrl }));
  const db = { storage: { from } } as unknown as SupabaseClient;
  const fetchFn = vi.fn(response) as unknown as typeof fetch;
  return { store: createSupabaseImageStore({ db, fetchFn }), upload, remove, list, from };
}

describe('SupabaseImageStore', () => {
  it('descarga, sube con hash corto y devuelve la URL pública', async () => {
    const t = setup(async () => image('image/png'));
    const url = await t.store.store('sofi.demo', 'https://cdn.example/a.png');
    const path = objectPath('sofi.demo', PNG, 'png');
    expect(url).toBe(`${PUBLIC}/${path}`);
    expect(path).toMatch(/^sofi\.demo\/[0-9a-f]{16}\.png$/);
    expect(t.from).toHaveBeenCalledWith(BUCKET);
    expect(t.upload).toHaveBeenCalledWith(path, PNG, { contentType: 'image/png', upsert: true });
  });

  it.each([
    ['mime no imagen', async () => image('text/html')],
    ['demasiado grande', async () => image('image/png', PNG, { 'content-length': OVERSIZE })],
    ['respuesta no ok', async () => new Response('x', { status: 403 })],
    ['fallo de red', async () => Promise.reject(new Error('boom'))],
  ])('devuelve null y no sube: %s', async (_name, response) => {
    const t = setup(response);
    expect(await t.store.store('a.demo', 'https://cdn.example/a.png')).toBeNull();
    expect(t.upload).not.toHaveBeenCalled();
  });

  it('rechaza orígenes que no son https y fuentes vacías sin llamar a la red', async () => {
    const t = setup(async () => image('image/png'));
    expect(await t.store.store('a.demo', 'http://cdn.example/a.png')).toBeNull();
    expect(await t.store.store('a.demo', null)).toBeNull();
    expect(t.upload).not.toHaveBeenCalled();
  });

  it('si la subida falla devuelve null (la ingesta no se rompe)', async () => {
    const t = setup(async () => image('image/png'), 'bucket missing');
    expect(await t.store.store('a.demo', 'https://cdn.example/a.png')).toBeNull();
  });

  it('deleteAll borra todos los objetos de la carpeta del handle', async () => {
    const t = setup(async () => image('image/png'));
    await t.store.deleteAll('a.demo');
    expect(t.list).toHaveBeenCalledWith('a.demo', expect.anything());
    expect(t.remove).toHaveBeenCalledWith(['a.demo/a.png', 'a.demo/b.jpg']);
  });
});
