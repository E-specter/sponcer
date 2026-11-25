import { useState, type SubmitEvent } from 'react';
import {
  AccountType,
  BRAND_SECTORS,
  CAMPAIGN_OBJECTIVES,
  Declared,
  MAX_BRAND_OBJECTIVES,
  MAX_BRAND_TARGET_NICHES,
  MAX_CREATOR_NICHES,
  NICHES,
  type BrandSector,
  type CampaignObjective,
  type Niche,
  type ProfileRole,
} from '@sponcer/contracts';
import { Alert } from '../../../components/ui/Alert';
import { CheckboxGroup } from '../../../components/ui/CheckboxGroup';
import { Field, describe } from '../../../components/ui/Field';
import { fieldErrors, messageOf } from '../../../components/ui/errors';
import { NICHE_LABEL, OBJECTIVE_LABEL, SECTOR_LABEL } from '../../../lib/labels';
import { updateDeclared } from '../api/panel';

const NICHE_OPTIONS = NICHES.map((value) => ({ value, label: NICHE_LABEL[value] }));
const OBJECTIVE_OPTIONS = CAMPAIGN_OBJECTIVES.map((value) => ({
  value,
  label: OBJECTIVE_LABEL[value],
}));
const ACCOUNT_LABEL: Record<AccountType, string> = {
  business: 'Negocio',
  creator: 'Creador',
  unknown: 'No lo sé',
};

interface Props {
  profileId: string;
  role: ProfileRole;
  initial: Declared | null;
}

export default function DeclaredForm({ profileId, role, initial }: Props) {
  const creator = initial?.role === 'creator' ? initial : null;
  const brand = initial?.role === 'brand' ? initial : null;

  const [niches, setNiches] = useState<Niche[]>(creator?.niches ?? []);
  const [city, setCity] = useState(creator?.city ?? '');
  const [sector, setSector] = useState<BrandSector | ''>(brand?.sector ?? '');
  const [objectives, setObjectives] = useState<CampaignObjective[]>(brand?.objectives ?? []);
  const [targetNiches, setTargetNiches] = useState<Niche[]>(brand?.targetNiches ?? []);
  const [budgetMin, setBudgetMin] = useState(String(brand?.budgetMinPen ?? ''));
  const [budgetMax, setBudgetMax] = useState(String(brand?.budgetMaxPen ?? ''));
  const [shortBio, setShortBio] = useState(initial?.shortBio ?? '');
  const [accountType, setAccountType] = useState<AccountType>(initial?.accountType ?? 'unknown');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const draft =
    role === 'creator'
      ? { role, niches, city: city || undefined, shortBio: shortBio || undefined, accountType }
      : {
          role,
          sector: sector || undefined,
          objectives,
          targetNiches,
          budgetMinPen: budgetMin === '' ? undefined : Number(budgetMin),
          budgetMaxPen: budgetMax === '' ? undefined : Number(budgetMax),
          shortBio: shortBio || undefined,
          accountType,
        };

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const parsed = Declared.safeParse(draft);
    if (!parsed.success) {
      setStatus(null);
      return setErrors(fieldErrors(parsed.error));
    }
    setErrors({});
    try {
      await updateDeclared(profileId, parsed.data);
      setStatus({ kind: 'success', text: 'Datos guardados.' });
    } catch (err) {
      setStatus({ kind: 'error', text: messageOf(err) });
    }
  }

  const id = (name: string) => `${profileId}-${name}`;

  return (
    <form onSubmit={submit} noValidate aria-label="Datos declarados">
      {role === 'creator' ? (
        <>
          <CheckboxGroup
            id={id('niches')}
            legend="Tus nichos"
            options={NICHE_OPTIONS}
            value={niches}
            onChange={setNiches}
            max={MAX_CREATOR_NICHES}
            error={errors.niches}
          />
          <Field id={id('city')} label="Ciudad" error={errors.city}>
            <input
              {...describe(id('city'), errors.city)}
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </Field>
        </>
      ) : (
        <>
          <Field id={id('sector')} label="Sector" error={errors.sector}>
            <select
              {...describe(id('sector'), errors.sector)}
              value={sector}
              onChange={(e) => setSector(BRAND_SECTORS.find((s) => s === e.target.value) ?? '')}
            >
              <option value="">Elige un sector</option>
              {BRAND_SECTORS.map((s) => (
                <option key={s} value={s}>
                  {SECTOR_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>
          <CheckboxGroup
            id={id('objectives')}
            legend="Objetivos de campaña"
            options={OBJECTIVE_OPTIONS}
            value={objectives}
            onChange={setObjectives}
            max={MAX_BRAND_OBJECTIVES}
            error={errors.objectives}
          />
          <CheckboxGroup
            id={id('target')}
            legend="Nichos de creadores que buscas"
            options={NICHE_OPTIONS}
            value={targetNiches}
            onChange={setTargetNiches}
            max={MAX_BRAND_TARGET_NICHES}
            error={errors.targetNiches}
          />
          <Field id={id('bmin')} label="Presupuesto mínimo (S/)" error={errors.budgetMinPen}>
            <input
              {...describe(id('bmin'), errors.budgetMinPen)}
              type="number"
              min={0}
              value={budgetMin}
              onChange={(e) => setBudgetMin(e.target.value)}
            />
          </Field>
          <Field id={id('bmax')} label="Presupuesto máximo (S/)" error={errors.budgetMaxPen}>
            <input
              {...describe(id('bmax'), errors.budgetMaxPen)}
              type="number"
              min={0}
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value)}
            />
          </Field>
        </>
      )}
      <Field id={id('bio')} label="Descripción corta" error={errors.shortBio}>
        <textarea
          {...describe(id('bio'), errors.shortBio)}
          value={shortBio}
          onChange={(e) => setShortBio(e.target.value)}
        />
      </Field>
      <Field id={id('acct')} label="Tipo de cuenta" error={errors.accountType}>
        <select
          {...describe(id('acct'), errors.accountType)}
          value={accountType}
          onChange={(e) =>
            setAccountType(AccountType.options.find((v) => v === e.target.value) ?? 'unknown')
          }
        >
          {AccountType.options.map((v) => (
            <option key={v} value={v}>
              {ACCOUNT_LABEL[v]}
            </option>
          ))}
        </select>
      </Field>
      <div aria-live="polite">{status && <Alert kind={status.kind}>{status.text}</Alert>}</div>
      <button type="submit" className="btn">
        Guardar datos
      </button>
    </form>
  );
}
