import { useState, type SubmitEvent } from 'react';
import { InviteUserRequest, type Invitation } from '@sponcer/contracts';
import { Alert } from '../../../components/ui/Alert';
import { Field, describe } from '../../../components/ui/Field';
import { messageOf } from '../../../components/ui/errors';
import { inviteUser } from '../api/admin';

export default function AdminInvitations() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Invitation | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const parsed = InviteUserRequest.safeParse({ email });
    if (!parsed.success) return setFieldError('Escribe un correo válido.');
    setFieldError(undefined);
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      setResult(await inviteUser(parsed.data.email));
      setEmail('');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-labelledby="invite">
      <h2 id="invite">Invitar a una persona</h2>
      <form onSubmit={submit} noValidate className="stack">
        <Field id="invite-email" label="Correo electrónico" error={fieldError}>
          <input
            {...describe('invite-email', fieldError)}
            type="email"
            value={email}
            autoComplete="off"
            placeholder="persona@correo.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar invitación'}
          </button>
        </div>
      </form>
      <div aria-live="polite">
        {error && <Alert kind="error">{error}</Alert>}
        {result && (
          <Alert kind={result.status === 'sent' ? 'success' : 'info'}>
            {result.status === 'sent'
              ? `Invitación enviada a ${result.email}.`
              : `${result.email} ya tiene cuenta: se le envió un enlace de acceso.`}
          </Alert>
        )}
      </div>
    </section>
  );
}
