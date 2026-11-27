import { useEffect, useId, useRef, useState } from 'react';
import type { ProfileSummary } from '@sponcer/contracts';
import QuoteComposer from './QuoteComposer';

interface Props {
  /** Marca activa que cotiza. */
  brandProfileId: string;
  target: ProfileSummary;
  serviceId?: string;
  label?: string;
  variant?: 'btn' | 'btn btn-secondary' | 'btn btn-secondary pcard-quote';
}

/** Botón "Cotizar" que abre el flujo en un diálogo nativo (foco atrapado y Esc para cerrar). */
export default function QuoteDialog({
  brandProfileId,
  target,
  serviceId,
  label = 'Cotizar',
  variant = 'btn btn-secondary',
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button type="button" className={variant} onClick={() => setOpen(true)}>
        {label}
      </button>
      <dialog
        ref={ref}
        className="dialog"
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === ref.current && setOpen(false)}
      >
        <div className="dialog-head">
          <h2 id={titleId}>Cotizar a @{target.handle}</h2>
          <button type="button" className="btn btn-text" onClick={() => setOpen(false)}>
            Cerrar
          </button>
        </div>
        {open && (
          <QuoteComposer
            brandProfileId={brandProfileId}
            targets={[target]}
            initialServiceId={serviceId}
          />
        )}
      </dialog>
    </>
  );
}
