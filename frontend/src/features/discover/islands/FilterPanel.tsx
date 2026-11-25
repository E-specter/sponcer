import { useStore } from '@nanostores/react';
import { NICHES, TIERS, type ProfileSummary } from '@sponcer/contracts';
import { CheckboxGroup } from '../../../components/ui/CheckboxGroup';
import { Field } from '../../../components/ui/Field';
import { NICHE_LABEL, TIER_LABEL } from '../../../lib/labels';
import { activeProfileId, resolveActive } from '../../../lib/state/active-profile';
import { EMPTY_FILTERS, filters } from './filters.store';

const NICHE_OPTIONS = NICHES.map((value) => ({ value, label: NICHE_LABEL[value] }));
const TIER_OPTIONS = TIERS.map((value) => ({ value, label: TIER_LABEL[value] }));

export default function FilterPanel({ profiles }: { profiles: ProfileSummary[] }) {
  const f = useStore(filters);
  const active = resolveActive(profiles, useStore(activeProfileId));

  return (
    <form className="card" aria-label="Filtros del feed" onSubmit={(e) => e.preventDefault()}>
      <h2>Filtros</h2>
      <CheckboxGroup
        id="f-niches"
        legend="Nichos"
        options={NICHE_OPTIONS}
        value={f.niches}
        onChange={(niches) => filters.setKey('niches', niches)}
      />
      <CheckboxGroup
        id="f-tiers"
        legend="Tamaño de audiencia"
        options={TIER_OPTIONS}
        value={f.tiers}
        onChange={(tiers) => filters.setKey('tiers', tiers)}
      />
      <Field id="f-eng" label="Interacción mínima (%)">
        <input
          id="f-eng"
          type="number"
          min={0}
          step="0.1"
          value={f.minEngagement}
          onChange={(e) => filters.setKey('minEngagement', e.target.value)}
        />
      </Field>
      {active?.role === 'brand' && (
        <Field id="f-price" label="Precio máximo del servicio (S/)">
          <input
            id="f-price"
            type="number"
            min={0}
            value={f.maxPricePen}
            onChange={(e) => filters.setKey('maxPricePen', e.target.value)}
          />
        </Field>
      )}
      {active?.role === 'creator' && (
        <Field id="f-budget" label="Presupuesto máximo mínimo de la marca (S/)">
          <input
            id="f-budget"
            type="number"
            min={0}
            value={f.minBudgetPen}
            onChange={(e) => filters.setKey('minBudgetPen', e.target.value)}
          />
        </Field>
      )}
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => filters.set({ ...EMPTY_FILTERS })}
      >
        Limpiar filtros
      </button>
    </form>
  );
}
