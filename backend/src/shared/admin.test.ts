import { describe, expect, it } from 'vitest';
import { loadEnv } from '../config/env';
import { adminEmailOf, isAdminEmail } from './admin';

describe('ADMIN_EMAILS', () => {
  it('se normaliza (comas, espacios, mayúsculas) y vacío por defecto', () => {
    expect(loadEnv({}).ADMIN_EMAILS).toEqual([]);
    const env = loadEnv({ ADMIN_EMAILS: ' Ana@Sponcer.pe, ,b@x.pe ' });
    expect(env.ADMIN_EMAILS).toEqual(['ana@sponcer.pe', 'b@x.pe']);
    expect(isAdminEmail(env.ADMIN_EMAILS, 'ANA@sponcer.pe')).toBe(true);
    expect(isAdminEmail(env.ADMIN_EMAILS, 'otra@x.pe')).toBe(false);
  });

  it('un correo inválido rompe el arranque', () => {
    expect(() => loadEnv({ ADMIN_EMAILS: 'no-es-correo' })).toThrow();
  });
});

describe('adminEmailOf', () => {
  it('correo sin verificar nunca llega como admin', () => {
    expect(adminEmailOf({ email: 'a@x.pe', emailConfirmed: false })).toBe('');
    expect(adminEmailOf({ email: 'a@x.pe', emailConfirmed: true })).toBe('a@x.pe');
    expect(adminEmailOf({ email: 'a@x.pe' })).toBe('a@x.pe');
  });
});
