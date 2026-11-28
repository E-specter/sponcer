import { useEffect, useRef } from 'react';
import type { ProfileSummary } from '@sponcer/contracts';
import { callBff } from '../../../lib/api/bff';
import { useActiveProfile } from '../../../lib/state/use-active-profile';

interface Props {
  /** Ficha que se está viendo. */
  viewedProfileId: string;
  viewedRole: ProfileSummary['role'];
  isOwner: boolean;
  myProfiles: ProfileSummary[];
}

/** No pinta nada: registra la visita (ADR-009) una vez por carga y sin bloquear el render. */
export default function ViewRecorder({ viewedProfileId, viewedRole, isOwner, myProfiles }: Props) {
  const { active, ready } = useActiveProfile(myProfiles);
  const sent = useRef(false);
  const viewerId = ready && active && active.role !== viewedRole && !isOwner ? active.id : null;

  useEffect(() => {
    if (!viewerId || sent.current) return;
    sent.current = true;
    (async () => {
      try {
        await callBff('recordProfileView', {
          params: { profileId: viewedProfileId },
          body: { viewerProfileId: viewerId },
        });
      } catch {
        // La visita es accesoria: si falla no se avisa al usuario.
      }
    })();
  }, [viewerId, viewedProfileId]);

  return null;
}
