import { useState, type SubmitEvent } from 'react';
import { MAX_REASON_LENGTH, RemovalRequest } from '@sponcer/contracts';
import { callBff } from '../../../lib/api/bff';
import { Alert } from '../../../components/ui/Alert';
import { Field, describe } from '../../../components/ui/Field';
import { fieldErrors, messageOf } from '../../../components/ui/errors';

export default function RemovalForm({ handle }: { handle: string }) {
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const parsed = RemovalRequest.safeParse({ email, reason: reason || undefined });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    try {
      await callBff('requestRemoval', { params: { handle }, body: parsed.data });
      setStatus({
        kind: 'success',
        text: 'Recibimos tu solicitud. Te escribiremos al correo indicado.',
      });
    } catch (err) {
      setStatus({ kind: 'error', text: messageOf(err) });
    }
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <Field id="rm-email" label="Correo de contacto" error={errors.email}>
        <input
          {...describe('rm-email', errors.email)}
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field
        id="rm-reason"
        label="Motivo (opcional)"
        error={errors.reason}
        hint={`Hasta ${MAX_REASON_LENGTH} caracteres`}
      >
        <textarea
          {...describe('rm-reason', errors.reason)}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      {status && <Alert kind={status.kind}>{status.text}</Alert>}
      <button className="btn" type="submit">
        Solicitar exclusión
      </button>
    </form>
  );
}
