import type { ClassificationApi } from '../ports/in/classification-api';
import type { ProfileReader } from '../ports/out/profile-reader';
import type { ClassifyProfile } from './classify-profile';

/** Secuencial a propósito: el modelo de embeddings corre en el mismo proceso. */
export const makeClassifyAll =
  (d: { profiles: ProfileReader; classify: ClassifyProfile }): ClassificationApi['classifyAll'] =>
  async () => {
    const ids = await d.profiles.listIds();
    return ids.reduce(
      async (acc, id) => {
        const total = await acc;
        const r = await d.classify(id);
        return r.ok
          ? { ...total, classified: total.classified + 1 }
          : { ...total, failed: total.failed + 1 };
      },
      Promise.resolve({ classified: 0, failed: 0 }),
    );
  };
