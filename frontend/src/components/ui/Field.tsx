import type { ReactNode } from 'react';

/** Atributos de accesibilidad para vincular un control con su mensaje de error. */
export const describe = (id: string, error?: string) => ({
  id,
  'aria-invalid': error ? (true as const) : undefined,
  'aria-describedby': error ? `${id}-error` : undefined,
});

interface FieldProps {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ id, label, error, hint, children }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && <span className="hint">{hint}</span>}
      {children}
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
