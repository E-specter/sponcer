import type { ReactNode } from 'react';

/** Reserva el espacio de una tarjeta mientras carga (sin saltos de layout; medidas en global.css). */
export function Skeleton() {
  return (
    <div className="card skeleton-card" aria-hidden="true">
      <span className="skeleton skeleton-avatar" />
      <span className="skeleton skeleton-line" />
      <span className="skeleton skeleton-fine" />
      <span className="skeleton skeleton-fine" />
    </div>
  );
}

interface EmptyStateProps {
  message: string;
  /** Salida clara (p. ej. "Limpiar filtros"). */
  action?: ReactNode;
  note?: string;
}

export function EmptyState({ message, action, note }: EmptyStateProps) {
  return (
    <div className="state">
      <p>{message}</p>
      {action}
      {note && <p className="small muted">{note}</p>}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  note?: string;
}

/** Dice qué pasó y qué se conserva; ofrece "Reintentar". */
export function ErrorState({
  message,
  onRetry,
  note = 'Tu selección sigue guardada.',
}: ErrorStateProps) {
  return (
    <div className="state state-error" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Reintentar
        </button>
      )}
      <p className="small muted">{note}</p>
    </div>
  );
}
