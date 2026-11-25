import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import {
  CITIES,
  NICHES,
  TIERS,
  type Niche,
  type ProfileSummary,
  type Tier,
} from '@sponcer/contracts';
import { Chip } from '../../../components/ui/Chip';
import { Field } from '../../../components/ui/Field';
import { SearchField } from '../../../components/ui/SearchField';
import { CITY_LABEL, NICHE_LABEL, TIER_LABEL } from '../../../lib/labels';
import { useActiveProfile } from '../../../lib/state/use-active-profile';
import { EMPTY_FILTERS, filters, searchQuery } from './filters.store';

const ICON_SIZE = 18;

const toggle = <T extends string>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

/** Búsqueda, chips de nicho y tier, y filtros avanzados (interacción, precio o presupuesto). */
export default function FilterPanel({ profiles }: { profiles: ProfileSummary[] }) {
  const f = useStore(filters);
  const query = useStore(searchQuery);
  const { active } = useActiveProfile(profiles);
  const [advanced, setAdvanced] = useState(false);

  return (
    <form
      className="filters-bar"
      aria-label="Filtros del feed"
      onSubmit={(e) => e.preventDefault()}
    >
      <SearchField
        id="f-search"
        label="Busca por nombre o interés"
        placeholder="Buscar personas o intereses"
        value={query}
        onChange={(v) => searchQuery.set(v)}
        large
      />
      <Field id="f-city" label="Ciudad">
        <select id="f-city" value={f.city} onChange={(e) => filters.setKey('city', e.target.value)}>
          <option value="">Todas las ciudades</option>
          {CITIES.map((c) => (
            <option key={c} value={c}>
              {CITY_LABEL[c]}
            </option>
          ))}
        </select>
      </Field>
      <div role="group" aria-label="Nichos" className="chips">
        {(advanced ? NICHES : f.niches).map((n: Niche) => (
          <Chip
            key={n}
            pressed={f.niches.includes(n)}
            onToggle={() => filters.setKey('niches', toggle(f.niches, n))}
          >
            {NICHE_LABEL[n]}
          </Chip>
        ))}
      </div>
      <div className="row">
        <div role="group" aria-label="Tamaño de audiencia" className="chips">
          {TIERS.map((t: Tier) => (
            <Chip
              key={t}
              pressed={f.tiers.includes(t)}
              onToggle={() => filters.setKey('tiers', toggle(f.tiers, t))}
            >
              {TIER_LABEL[t]}
            </Chip>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          aria-expanded={advanced}
          aria-controls="filtros-avanzados"
          onClick={() => setAdvanced((o) => !o)}
        >
          <SlidersHorizontal size={ICON_SIZE} strokeWidth={2} aria-hidden="true" />
          Filtros
        </button>
        <button
          type="button"
          className="btn btn-text"
          onClick={() => {
            filters.set({ ...EMPTY_FILTERS });
            searchQuery.set('');
          }}
        >
          Limpiar filtros
        </button>
      </div>
      {advanced && (
        <div id="filtros-avanzados" className="card">
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
        </div>
      )}
    </form>
  );
}
