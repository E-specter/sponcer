import type { ProfilesApi } from '../../../../profiles';
import type { ProfileReader } from '../../../application/ports/out/profile-reader';

/** Adaptador de `ProfileReader` sobre la API pública del slice profiles. */
export const createProfilesApiReader = (profiles: ProfilesApi): ProfileReader => {
  const all = async () => [
    ...(await profiles.listCandidates('creator')),
    ...(await profiles.listCandidates('brand')),
  ];
  return {
    async get(profileId) {
      const r = await profiles.getById(profileId);
      return r.ok ? { id: r.value.id, handle: r.value.handle, declared: r.value.declared } : null;
    },
    findIdByHandle: async (handle) => (await all()).find((p) => p.handle === handle)?.id ?? null,
    listIds: async () => (await all()).map((p) => p.id),
  };
};
