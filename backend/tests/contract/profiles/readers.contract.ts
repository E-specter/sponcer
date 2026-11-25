import { describe, expect, it } from 'vitest';
import { Classification, IgProfileSnapshot } from '@sponcer/contracts';
import { fixtureProfiles } from '@sponcer/contracts/fixtures';
import type { ClassificationReader } from '../../../src/modules/profiles/application/ports/out/classification-reader';
import type { SnapshotReader } from '../../../src/modules/profiles/application/ports/out/snapshot-reader';

const FIXTURE = fixtureProfiles[0]!;
const MISSING_ID = '00000000-0000-4000-8000-000000000000';

/** Suite de `SnapshotReader` (en F2 lo implementa ingestion). Sembrado con los fixtures. */
export function describeSnapshotReaderContract(
  factory: () => SnapshotReader | Promise<SnapshotReader>,
): void {
  describe('SnapshotReader (contrato del puerto)', () => {
    it('devuelve el snapshot del handle, válido contra IgProfileSnapshot', async () => {
      const snap = await (await factory()).getByHandle(FIXTURE.snapshot.handle);
      expect(IgProfileSnapshot.safeParse(snap).success).toBe(true);
      expect(snap?.handle).toBe(FIXTURE.snapshot.handle);
    });

    it('devuelve null para un handle sin snapshot', async () => {
      expect(await (await factory()).getByHandle('no.existe.zz')).toBeNull();
    });
  });
}

/** Suite de `ClassificationReader` (en F2 lo implementa classification). */
export function describeClassificationReaderContract(
  factory: () => ClassificationReader | Promise<ClassificationReader>,
): void {
  describe('ClassificationReader (contrato del puerto)', () => {
    it('devuelve null o una Classification válida para un perfil sembrado', async () => {
      const c = await (await factory()).getByProfileId(FIXTURE.id);
      if (c !== null) expect(Classification.safeParse(c).success).toBe(true);
    });

    it('devuelve null para un perfil inexistente', async () => {
      expect(await (await factory()).getByProfileId(MISSING_ID)).toBeNull();
    });
  });
}
