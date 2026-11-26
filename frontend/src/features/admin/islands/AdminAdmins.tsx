import { useEffect, useState, type SubmitEvent } from 'react';
import { AdminEmailRequest, type AdminEntry } from '@sponcer/contracts';
import { Alert } from '../../../components/ui/Alert';
import { Field, describe } from '../../../components/ui/Field';
import { messageOf } from '../../../components/ui/errors';
import { EmptyState, ErrorState, Skeleton } from '../../../components/ui/States';
import { Tag } from '../../../components/ui/Tag';
import { formatDate } from '../../../lib/labels';
import { grantAdmin, listAdmins, revokeAdmin } from '../api/admin';

export default function AdminAdmins() {
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Quitar un rol exige confirmación en pantalla (sin window.confirm).
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const list = await listAdmins();
        if (cancelled) return;
        setAdmins(list);
        setLoadError(null);
      } catch (e) {
        if (!cancelled) setLoadError(messageOf(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloads]);

  async function run(action: () => Promise<AdminEntry[]>, message: string): Promise<boolean> {
    setBusy(true);
    setActionError(null);
    setDone(null);
    try {
      setAdmins(await action());
      setDone(message);
      return true;
    } catch (e) {
      setActionError(messageOf(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function grant(e: SubmitEvent) {
    e.preventDefault();
    const parsed = AdminEmailRequest.safeParse({ email });
    if (!parsed.success) return setFieldError('Escribe un correo válido.');
    setFieldError(undefined);
    const { email: target } = parsed.data;
    if (await run(() => grantAdmin(target), `${target} ahora es administrador.`)) setEmail('');
  }

  async function revoke(target: string) {
    await run(() => revokeAdmin(target), `${target} ya no es administrador.`);
    setConfirming(null);
  }

  return (
    <section className="stack" aria-label="Administradores">
      <form onSubmit={grant} noValidate className="card stack">
        <Field id="grant-email" label="Nombrar administrador por correo" error={fieldError}>
          <input
            {...describe('grant-email', fieldError)}
            type="email"
            value={email}
            autoComplete="off"
            placeholder="persona@correo.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <div>
          <button className="btn" type="submit" disabled={busy}>
            Nombrar administrador
          </button>
        </div>
      </form>
      <div aria-live="polite">
        {done && <Alert kind="success">{done}</Alert>}
        {actionError && <Alert kind="error">{actionError}</Alert>}
      </div>
      {loadError && <ErrorState message={loadError} onRetry={() => setReloads((n) => n + 1)} />}
      {loading && <Skeleton />}
      {!loading && !loadError && admins.length === 0 && (
        <EmptyState message="No hay administradores." />
      )}
      {!loading &&
        admins.map((a) => (
          <article key={a.email} className="card stack" aria-labelledby={`adm-${a.email}`}>
            <h3 id={`adm-${a.email}`} style={{ overflowWrap: 'anywhere' }}>
              {a.email}
            </h3>
            <p className="row">
              <Tag tone={a.source === 'env' ? 'neutral' : 'accion'}>
                {a.source === 'env' ? 'Fijo (.env)' : 'Nombrado en la app'}
              </Tag>
              {a.grantedAt && (
                <span className="muted small">
                  Desde el {formatDate(a.grantedAt)}
                  {a.grantedBy ? ` por ${a.grantedBy}` : ''}
                </span>
              )}
            </p>
            {a.source === 'app' && confirming !== a.email && (
              <div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setConfirming(a.email)}
                >
                  Quitar administrador
                </button>
              </div>
            )}
            {confirming === a.email && (
              <div className="stack" role="group" aria-label={`Confirmar quitar a ${a.email}`}>
                <p>¿Quitar el rol de administrador a {a.email}?</p>
                <div className="row">
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busy}
                    onClick={() => revoke(a.email)}
                  >
                    Sí, quitar
                  </button>
                  <button
                    type="button"
                    className="btn btn-text"
                    disabled={busy}
                    onClick={() => setConfirming(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
    </section>
  );
}
