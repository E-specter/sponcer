import type { Me } from '@sponcer/contracts';
import { call } from './api';

const cache = new WeakMap<App.Locals, Promise<Me>>();

/** `me` una sola vez por petición (layout y página lo comparten). */
export function getMe(locals: App.Locals): Promise<Me> {
  const hit = cache.get(locals);
  if (hit) return hit;
  const pending = call('me', { token: locals.accessToken });
  cache.set(locals, pending);
  return pending;
}
