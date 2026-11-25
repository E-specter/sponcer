import { Search } from 'lucide-react';

const ICON_SIZE = 18;

interface SearchFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** 52 px de alto y etiqueta "Buscar" a la derecha (Descubrir). */
  large?: boolean;
}

export function SearchField({ id, label, value, onChange, placeholder, large }: SearchFieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className={`search ${large ? 'search-lg' : ''}`}>
        <Search size={ICON_SIZE} strokeWidth={2} aria-hidden="true" />
        <input
          id={id}
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        {large && (
          <span className="search-tag" aria-hidden="true">
            Buscar
          </span>
        )}
      </div>
    </div>
  );
}
