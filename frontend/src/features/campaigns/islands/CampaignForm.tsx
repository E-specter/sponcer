import { useState, type SubmitEvent } from 'react';
import {
  CAMPAIGN_KINDS,
  CITIES,
  CreateCampaignRequest,
  MAX_BRAND_TARGET_NICHES,
  MAX_CAMPAIGN_CITIES,
  NICHES,
  UpdateCampaignRequest,
  type Campaign,
  type CampaignKind,
  type City,
  type Niche,
} from '@sponcer/contracts';
import { Alert } from '../../../components/ui/Alert';
import { CheckboxGroup } from '../../../components/ui/CheckboxGroup';
import { Field, describe } from '../../../components/ui/Field';
import { fieldErrors, messageOf } from '../../../components/ui/errors';
import { CAMPAIGN_KIND_LABEL, CITY_LABEL, NICHE_LABEL } from '../../../lib/labels';
import { createCampaign, updateCampaign } from '../api/campaigns';

const NICHE_OPTIONS = NICHES.map((value) => ({ value, label: NICHE_LABEL[value] }));
const CITY_OPTIONS = CITIES.map((value) => ({ value, label: CITY_LABEL[value] }));
const DATE_LENGTH = 10;
const MAX_NAME = 80;
const today = (): string => new Date().toISOString().slice(0, DATE_LENGTH);

interface Props {
  brandProfileId: string;
  /** Con `campaign` el formulario edita; sin ella, crea. */
  campaign?: Campaign;
  onSaved: (c: Campaign) => void;
  onCancel?: () => void;
}

/** Alta y edición de campaña con los esquemas del contrato (ADR-009). */
export default function CampaignForm({ brandProfileId, campaign, onSaved, onCancel }: Props) {
  const [name, setName] = useState(campaign?.name ?? '');
  const [kind, setKind] = useState<CampaignKind>(campaign?.kind ?? 'season');
  const [description, setDescription] = useState(campaign?.description ?? '');
  const [startsOn, setStartsOn] = useState(campaign?.startsOn ?? today());
  const [endsOn, setEndsOn] = useState(campaign?.endsOn ?? '');
  const [budget, setBudget] = useState(String(campaign?.budgetPen ?? ''));
  const [niches, setNiches] = useState<Niche[]>(campaign?.targetNiches ?? []);
  const [cities, setCities] = useState<City[]>(campaign?.targetCities ?? []);
  const [activate, setActivate] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const fields = {
      brandProfileId,
      name,
      kind,
      description: description.trim() || undefined,
      startsOn,
      endsOn: endsOn || null,
      budgetPen: budget === '' ? null : Number(budget),
      targetNiches: niches,
      targetCities: cities,
    };
    const parsed = campaign
      ? UpdateCampaignRequest.safeParse(fields)
      : CreateCampaignRequest.safeParse({ ...fields, activate });
    if (!parsed.success) {
      setFailure(null);
      return setErrors(fieldErrors(parsed.error));
    }
    setErrors({});
    setBusy(true);
    try {
      const saved = campaign
        ? await updateCampaign(campaign.id, parsed.data)
        : await createCampaign(parsed.data as CreateCampaignRequest);
      onSaved(saved);
    } catch (err) {
      setFailure(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const id = (n: string) => `cf-${campaign?.id ?? 'new'}-${n}`;
  return (
    <form onSubmit={submit} noValidate aria-label={campaign ? 'Editar campaña' : 'Nueva campaña'}>
      <Field id={id('name')} label="Nombre de la campaña" error={errors.name}>
        <input
          {...describe(id('name'), errors.name)}
          value={name}
          maxLength={MAX_NAME}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field id={id('kind')} label="Tipo" error={errors.kind}>
        <select
          {...describe(id('kind'), errors.kind)}
          value={kind}
          onChange={(e) => setKind(CAMPAIGN_KINDS.find((k) => k === e.target.value) ?? 'other')}
        >
          {CAMPAIGN_KINDS.map((k) => (
            <option key={k} value={k}>
              {CAMPAIGN_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>
      <Field id={id('desc')} label="Descripción (opcional)" error={errors.description}>
        <textarea
          {...describe(id('desc'), errors.description)}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="grid">
        <Field id={id('start')} label="Inicio" error={errors.startsOn}>
          <input
            {...describe(id('start'), errors.startsOn)}
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
          />
        </Field>
        <Field id={id('end')} label="Fin (opcional)" error={errors.endsOn}>
          <input
            {...describe(id('end'), errors.endsOn)}
            type="date"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
          />
        </Field>
        <Field id={id('budget')} label="Presupuesto en S/ (opcional)" error={errors.budgetPen}>
          <input
            {...describe(id('budget'), errors.budgetPen)}
            type="number"
            min={0}
            inputMode="numeric"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </Field>
      </div>
      <CheckboxGroup
        id={id('niches')}
        legend="Nichos objetivo"
        options={NICHE_OPTIONS}
        value={niches}
        onChange={setNiches}
        max={MAX_BRAND_TARGET_NICHES}
        error={errors.targetNiches}
      />
      <CheckboxGroup
        id={id('cities')}
        legend="Ciudades objetivo"
        options={CITY_OPTIONS}
        value={cities}
        onChange={setCities}
        max={MAX_CAMPAIGN_CITIES}
        error={errors.targetCities}
      />
      {!campaign && (
        <label className="row">
          <input
            type="checkbox"
            checked={activate}
            onChange={(e) => setActivate(e.target.checked)}
          />
          Activar al crear (si no, queda como borrador)
        </label>
      )}
      <div aria-live="polite">{failure && <Alert kind="error">{failure}</Alert>}</div>
      <div className="row">
        <button type="submit" className="btn" disabled={busy}>
          {campaign ? 'Guardar cambios' : 'Crear campaña'}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}
