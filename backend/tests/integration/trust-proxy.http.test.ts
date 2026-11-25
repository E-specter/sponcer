import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { api } from '@sponcer/contracts';
import { buildTestApp, STATUS } from '../support/app';

/**
 * ADR-007: el backend solo confía en `X-Forwarded-For` si la conexión llega desde loopback (el BFF en la misma PC).
 * Desde cualquier otra dirección la cabecera se IGNORA: si no, un cliente podría falsearla para saltarse el rate limit
 * (cambiando la IP en cada petición) o para cargarle el cupo a otra IP.
 * Se prueba con conexiones TCP reales: una a 127.0.0.1 y otra a la IP de red local de la máquina (no loopback).
 */
const REMOVAL_LIMIT_PER_HOUR = 20;
const OVER = 1;
const PARITY = 2;
const path = (handle: string) => api.requestRemoval.path.replace(':handle', handle);

/** Primera IPv4 no interna de la máquina (la conexión a ella no llega desde loopback). */
const lanIp = Object.values(networkInterfaces())
  .flat()
  .find((i) => i?.family === 'IPv4' && !i.internal)?.address;

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
  );
});

async function listen(host: string) {
  const { app } = await buildTestApp();
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const base = `http://${host}:${(server.address() as AddressInfo).port}`;
  /** Pedido de exclusión anónimo con la IP "de cliente" declarada en X-Forwarded-For. */
  const post = async (forwardedFor: string) => {
    const res = await fetch(`${base}${path('cuenta.limite.zz')}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': forwardedFor },
      body: JSON.stringify({ email: 'titular@correo.pe' }),
    });
    return res.status;
  };
  /** `n` pedidos en serie con la IP que devuelve `ipFor(i)`; devuelve los códigos de estado. */
  const burst = (n: number, ipFor: (i: number) => string) =>
    Array.from({ length: n }).reduce<Promise<number[]>>(
      async (acc, _x, i) => [...(await acc), await post(ipFor(i))],
      Promise.resolve([]),
    );
  return { post, burst };
}

const count = (codes: number[], status: number) => codes.filter((c) => c === status).length;

describe('trust proxy: loopback (el BFF local)', () => {
  it('con X-Forwarded-For distinto en cada petición, cada IP tiene su propio cupo', async () => {
    const s = await listen('127.0.0.1');
    const codes = await s.burst(REMOVAL_LIMIT_PER_HOUR + OVER, (i) => `203.0.113.${i + OVER}`);
    expect(codes.every((c) => c === STATUS.OK)).toBe(true);
  });

  it('con la misma IP reenviada el cupo se agota y otra IP reenviada no se ve afectada', async () => {
    const s = await listen('127.0.0.1');
    const same = await s.burst(REMOVAL_LIMIT_PER_HOUR + OVER, () => '203.0.113.50');
    expect(count(same, STATUS.OK)).toBe(REMOVAL_LIMIT_PER_HOUR);
    expect(same.at(-1)).toBe(STATUS.TOO_MANY);
    expect(await s.post('203.0.113.51')).toBe(STATUS.OK);
  });
});

describe.skipIf(!lanIp)('trust proxy: conexión que NO es loopback', () => {
  it('X-Forwarded-For se ignora: cambiar la IP en cada petición no evita el límite', async () => {
    const s = await listen(lanIp!);
    const codes = await s.burst(REMOVAL_LIMIT_PER_HOUR + OVER, (i) => `203.0.113.${i + OVER}`);
    expect(count(codes, STATUS.OK)).toBe(REMOVAL_LIMIT_PER_HOUR);
    expect(codes.at(-1)).toBe(STATUS.TOO_MANY);
  });

  it('declararse como loopback o como otra IP en X-Forwarded-For tampoco cambia el cupo', async () => {
    const s = await listen(lanIp!);
    const spoofed = await s.burst(REMOVAL_LIMIT_PER_HOUR + OVER, (i) =>
      i % PARITY ? '127.0.0.1' : '::1',
    );
    expect(spoofed.at(-1)).toBe(STATUS.TOO_MANY);
    // ni siquiera una IP nueva "reenviada" libera el cupo agotado de la conexión real
    expect(await s.post('198.51.100.7')).toBe(STATUS.TOO_MANY);
  });
});
