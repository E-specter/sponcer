import { useStore } from '@nanostores/react';
import { useState, type SubmitEvent } from 'react';
import {
  CreateQuoteRequest,
  MAX_QUOTE_MESSAGE,
  type ProfileSummary,
  type Service,
} from '@sponcer/contracts';
import { Alert } from '../../../components/ui/Alert';
import { Field, describe } from '../../../components/ui/Field';
import { fieldErrors, messageOf } from '../../../components/ui/errors';
import { SERVICE_FORMAT_LABEL, SERVICE_TYPE_LABEL, formatPen } from '../../../lib/labels';
import { activeProfileId, resolveActive } from '../../../lib/state/active-profile';
import { createQuote } from '../api/quotes';

interface Props {
  services: Service[];
  /** Perfiles del usuario: el botón solo aparece si el perfil activo es una marca. */
  myProfiles: ProfileSummary[];
  viewedRole: ProfileSummary['role'];
  isOwner: boolean;
}

export default function ServiceCatalog({ services, myProfiles, viewedRole, isOwner }: Props) {
  const active = resolveActive(myProfiles, useStore(activeProfileId));
  const canRequest = active?.role === 'brand' && viewedRole === 'creator' && !isOwner;
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function submit(e: SubmitEvent, serviceId: string) {
    e.preventDefault();
    if (!active) return;
    const parsed = CreateQuoteRequest.safeParse({
      requesterProfileId: active.id,
      serviceId,
      message,
      amountPen: amount === '' ? undefined : Number(amount),
      send: true,
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    try {
      await createQuote(parsed.data);
      setResult({ kind: 'success', text: 'Cotización enviada.' });
      setOpenId(null);
      setMessage('');
      setAmount('');
    } catch (err) {
      setResult({ kind: 'error', text: messageOf(err) });
    }
  }

  if (services.length === 0) return <p className="muted">Este creador aún no publica servicios.</p>;

  return (
    <div className="stack">
      {result && (
        <Alert kind={result.kind}>
          {result.text}{' '}
          {result.kind === 'success' && <a href="/panel/cotizaciones">Ver mis cotizaciones</a>}
        </Alert>
      )}
      <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
        {services.map((s) => (
          <li key={s.id} className="card">
            <h3>
              {SERVICE_TYPE_LABEL[s.type]} · {SERVICE_FORMAT_LABEL[s.format]} ·{' '}
              {formatPen(s.pricePen)}
            </h3>
            <p>{s.description}</p>
            {canRequest && openId !== s.id && (
              <button type="button" className="btn" onClick={() => setOpenId(s.id)}>
                Solicitar cotización
              </button>
            )}
            {canRequest && openId === s.id && (
              <form onSubmit={(e) => submit(e, s.id)} noValidate>
                <Field
                  id={`q-msg-${s.id}`}
                  label="Mensaje para el creador"
                  error={errors.message}
                  hint={`Hasta ${MAX_QUOTE_MESSAGE} caracteres`}
                >
                  <textarea
                    {...describe(`q-msg-${s.id}`, errors.message)}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </Field>
                <Field
                  id={`q-amt-${s.id}`}
                  label="Monto propuesto en S/ (opcional)"
                  error={errors.amountPen}
                >
                  <input
                    {...describe(`q-amt-${s.id}`, errors.amountPen)}
                    type="number"
                    min={0}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </Field>
                <div className="row">
                  <button type="submit" className="btn">
                    Enviar solicitud
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setOpenId(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
