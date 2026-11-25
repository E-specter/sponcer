import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

const CHECK_SIZE = 14;

interface ChipProps {
  children: ReactNode;
  /** Si se pasa `onToggle`, es un botón de filtro (aria-pressed) con check cuando está activo. */
  pressed?: boolean;
  onToggle?: () => void;
}

/** Chip de nicho (estático) o de filtro (botón). El estado activo lleva check además del color. */
export function Chip({ children, pressed, onToggle }: ChipProps) {
  if (!onToggle) return <span className="chip">{children}</span>;
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onToggle}>
      {pressed && <Check size={CHECK_SIZE} strokeWidth={2} aria-hidden="true" />}
      {children}
    </button>
  );
}
