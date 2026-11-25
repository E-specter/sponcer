import { defineConfig, envField } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  env: {
    schema: {
      PUBLIC_API_URL: envField.string({
        context: 'client',
        access: 'public',
        default: 'http://localhost:3000',
      }),
      PUBLIC_API_MODE: envField.enum({
        context: 'client',
        access: 'public',
        values: ['mock', 'http'],
        default: 'mock',
      }),
      // mock = sesión demo local (token `mock:<id>`) | supabase = enlace mágico y JWT real.
      PUBLIC_AUTH_MODE: envField.enum({
        context: 'client',
        access: 'public',
        values: ['mock', 'supabase'],
        default: 'mock',
      }),
      // ADR-007: acceso de demo con cuentas sembradas. Desactivado por defecto.
      PUBLIC_DEMO_LOGIN: envField.boolean({ context: 'client', access: 'public', default: false }),
      // Contraseña de las cuentas demo: secreto de servidor, nunca llega al cliente.
      DEMO_PASSWORD: envField.string({ context: 'server', access: 'secret', optional: true }),
      PUBLIC_SUPABASE_URL: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_SUPABASE_ANON_KEY: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
    },
  },
});
