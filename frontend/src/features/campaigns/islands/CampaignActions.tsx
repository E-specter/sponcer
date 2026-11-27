import { useState } from 'react';
import type { Campaign, CampaignStatus } from '@sponcer/contracts';
import { Alert } from '../../../components/ui/Alert';
import { messageOf } from '../../../components/ui/errors';
import { updateCampaign } from '../api/campaigns';
import CampaignForm from './CampaignForm';

const NEXT: Partial<Record<CampaignStatus, { to: CampaignStatus; label: string }>> = {
  draft: { to: 'active', label: 'Activar campaña' },
  active: { to: 'closed', label: 'Cerrar campaña' },
};

/** Activar, cerrar y editar desde el detalle; recarga la página para ver el avance actualizado. */
export default function CampaignActions({ campaign }: { campaign: Campaign }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = NEXT[campaign.status];

  async function move(to: CampaignStatus) {
    setBusy(true);
    try {
      await updateCampaign(campaign.id, { brandProfileId: campaign.brandProfileId, status: to });
      window.location.reload();
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="row">
        {next && (
          <button
            type="button"
            className={next.to === 'closed' ? 'btn btn-danger' : 'btn'}
            disabled={busy}
            onClick={() => move(next.to)}
          >
            {next.label}
          </button>
        )}
        {campaign.status !== 'closed' && !editing && (
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
            Editar
          </button>
        )}
      </div>
      <div aria-live="polite">{error && <Alert kind="error">{error}</Alert>}</div>
      {editing && (
        <div className="card">
          <CampaignForm
            brandProfileId={campaign.brandProfileId}
            campaign={campaign}
            onCancel={() => setEditing(false)}
            onSaved={() => window.location.reload()}
          />
        </div>
      )}
    </div>
  );
}
