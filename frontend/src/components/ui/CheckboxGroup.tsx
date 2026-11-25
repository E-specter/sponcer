interface Option<T extends string> {
  value: T;
  label: string;
}

interface CheckboxGroupProps<T extends string> {
  id: string;
  legend: string;
  options: Option<T>[];
  value: T[];
  onChange: (next: T[]) => void;
  max?: number;
  error?: string;
}

/** Selección múltiple de catálogo con tope opcional (los no elegidos se deshabilitan al llegar al tope). */
export function CheckboxGroup<T extends string>({
  id,
  legend,
  options,
  value,
  onChange,
  max,
  error,
}: CheckboxGroupProps<T>) {
  const full = max !== undefined && value.length >= max;
  return (
    <fieldset aria-describedby={error ? `${id}-error` : undefined}>
      <legend>
        {legend}
        {max !== undefined && <span className="muted small"> (hasta {max})</span>}
      </legend>
      <div className="checks">
        {options.map((o) => {
          const checked = value.includes(o.value);
          return (
            <label key={o.value}>
              <input
                type="checkbox"
                checked={checked}
                disabled={!checked && full}
                onChange={() =>
                  onChange(checked ? value.filter((v) => v !== o.value) : [...value, o.value])
                }
              />
              {o.label}
            </label>
          );
        })}
      </div>
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
