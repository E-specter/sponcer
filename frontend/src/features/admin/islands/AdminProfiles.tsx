import { useState, type SubmitEvent } from 'react';
import { AdminAddProfileRequest, type ProfileDetail } from '@sponcer/contracts';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Field, describe } from '../../../components/ui/Field';
import { fieldErrors, messageOf } from '../../../components/ui/errors';
import { addProfile } from '../api/admin';

export default function AdminProfiles() {
  const [handle, setHandle] = useState('');
  const [role, setRole] = useState<'creator' | 'brand'>('creator');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ProfileDetail | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const parsed = AdminAddProfileRequest.safeParse({ handle, role });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setError(null);
    setCreated(null);
    setBusy(true);
    try {
      setCreated(await addProfile(parsed.data));
      setHandle('');
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-labelledby="add-profile">
      <h2 id="add-profile">Nueva ficha por @handle</h2>
      <form onSubmit={submit} noValidate className="stack">
        <Field id="add-handle" label="@handle de Instagram" error={errors.handle}>
          <input
            {...describe('add-handle', errors.handle)}
            value={handle}
            autoComplete="off"
            placeholder="@cuenta.publica"
            onChange={(e) => setHandle(e.target.value)}
          />
        </Field>
        <Field id="add-role" label="Rol de la ficha" error={errors.role}>
          <select
            {...describe('add-role', errors.role)}
            value={role}
            onChange={(e) => setRole(e.target.value === 'brand' ? 'brand' : 'creator')}
          >
            <option value="creator">Creador</option>
            <option value="brand">Marca</option>
          </select>
        </Field>
        <div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Agregando…' : 'Agregar ficha'}
          </button>
        </div>
      </form>
      <div aria-live="polite">
        {error && <Alert kind="error">{error}</Alert>}
        {created && (
          <Alert kind="success">
            Ficha creada: {created.fullName || `@${created.handle}`} (@{created.handle}).
          </Alert>
        )}
      </div>
      {created && <Button href={`/perfil/${created.handle}`}>Ver el perfil</Button>}
    </section>
  );
}
