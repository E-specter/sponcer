import { describe, expect, it } from 'vitest';
import type { IdentityProvider } from '../../../src/modules/auth/application/ports/out/identity-provider';

export interface IdentityProviderFixture {
  /** Cabecera `Authorization` que el adaptador debe aceptar. */
  validHeader: string;
  expectedUser: { userId: string; email: string };
}

const INVALID_HEADERS: Array<[string, string | undefined]> = [
  ['sin cabecera', undefined],
  ['cabecera vacía', ''],
  ['solo el esquema', 'Bearer'],
  ['esquema sin token', 'Bearer '],
  ['esquema distinto de Bearer', 'Basic dXNlcjpwYXNz'],
  ['token basura', 'Bearer no-es-un-token'],
  ['token de otro formato', 'Bearer a.b.c'],
  ['usuario inexistente', 'Bearer mock:00000000-0000-4000-8000-000000000000'],
  ['inyección en el token', "Bearer ' OR 1=1 --"],
];

/** Suite del puerto out `IdentityProvider`. Un header inválido da `null`: nunca lanza. */
export function describeIdentityProviderContract(
  factory: () => IdentityProvider | Promise<IdentityProvider>,
  fixtureSource: IdentityProviderFixture | (() => Promise<IdentityProviderFixture>),
): void {
  // Un adaptador real necesita un token emitido en el momento: la fixture puede ser asíncrona.
  const fixtureOf = async () =>
    typeof fixtureSource === 'function' ? fixtureSource() : fixtureSource;
  describe('IdentityProvider (contrato del puerto)', () => {
    it('resuelve el usuario de una cabecera válida', async () => {
      const fixture = await fixtureOf();
      const user = await (await factory()).authenticate(fixture.validHeader);
      expect(user).toEqual(fixture.expectedUser);
    });

    it.each(INVALID_HEADERS)('devuelve null con %s', async (_name, header) => {
      await expect((await factory()).authenticate(header)).resolves.toBeNull();
    });

    // El esquema de Authorization no distingue mayúsculas (RFC 9110): "Bearer x" y "bearer x" son lo mismo.
    it('acepta el esquema en minúsculas', async () => {
      const fixture = await fixtureOf();
      const lower = fixture.validHeader.replace('Bearer', 'bearer');
      expect(await (await factory()).authenticate(lower)).toEqual(fixture.expectedUser);
    });

    it('la misma cabecera da el mismo usuario en llamadas repetidas', async () => {
      const fixture = await fixtureOf();
      const provider = await factory();
      const [a, b] = await Promise.all([
        provider.authenticate(fixture.validHeader),
        provider.authenticate(fixture.validHeader),
      ]);
      expect(a).toEqual(b);
    });
  });
}
