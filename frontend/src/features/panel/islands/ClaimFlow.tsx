import { PUBLIC_API_MODE } from 'astro:env/client';
import { useState, type SubmitEvent } from 'react';
import {
  CLAIM_TTL_MINUTES,
  StartClaimRequest,
  type Claim,
  type VerifyClaimResult,
} from '@sponcer/contracts';
import { Alert } from '../../../components/ui/Alert';
import { Field, describe } from '../../../components/ui/Field';
import { fieldErrors, messageOf } from '../../../components/ui/errors';
import { startClaim, verifyClaim } from '../api/panel';

type Outcome = { kind: 'success' | 'error' | 'info'; text: string };

const NOT_ELIGIBLE_TEXT = {
  private: 'La cuenta es privada. Hazla pública para poder verificarla.',
  not_professional: 'La cuenta debe ser profesional (creador o negocio) para poder verificarla.',
  removed: 'La cuenta ya no está disponible en Instagram.',
} as const;

const OUTCOME_BY_STATUS: Record<VerifyClaimResult['status'], (r: VerifyClaimResult) => Outcome> = {
  verified: () => ({ kind: 'success', text: '¡Verificado! El perfil ya es tuyo.' }),
  code_not_found: () => ({
    kind: 'error',
    text: 'No encontramos el código en tu biografía. Pégalo, guarda los cambios en Instagram y vuelve a verificar.',
  }),
  expired: () => ({ kind: 'error', text: 'El código expiró. Genera uno nuevo.' }),
  already_owned: () => ({ kind: 'error', text: 'Este perfil ya fue reclamado por otra persona.' }),
  not_eligible: (r) => ({
    kind: 'error',
    text: r.status === 'not_eligible' ? NOT_ELIGIBLE_TEXT[r.reason] : '',
  }),
};

const outcomeOf = (r: VerifyClaimResult): Outcome => OUTCOME_BY_STATUS[r.status](r);

export default function ClaimFlow() {
  const [handle, setHandle] = useState('');
  const [role, setRole] = useState<'creator' | 'brand'>('creator');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [claim, setClaim] = useState<Claim | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);

  async function start(e: SubmitEvent) {
    e.preventDefault();
    const parsed = StartClaimRequest.safeParse({ handle, role });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    try {
      setClaim(await startClaim(parsed.data));
      setOutcome(null);
    } catch (err) {
      setOutcome({ kind: 'error', text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!claim) return;
    setBusy(true);
    try {
      const result = await verifyClaim(claim.claimId);
      setOutcome(outcomeOf(result));
      setVerified(result.status === 'verified');
      if (result.status === 'expired') setClaim(null);
    } catch (err) {
      setOutcome({ kind: 'error', text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!claim) return;
    try {
      await navigator.clipboard.writeText(claim.code);
      setOutcome({ kind: 'info', text: 'Código copiado.' });
    } catch {
      setOutcome({
        kind: 'info',
        text: 'No se pudo copiar automáticamente: selecciona el código y cópialo.',
      });
    }
  }

  return (
    <section className="card stack" aria-labelledby="reclamar">
      <h2 id="reclamar">Reclamar un perfil</h2>
      <p className="muted small">
        Tus fuentes, tu control: confirmas que la cuenta es tuya con un código en tu bio. No
        accedemos a datos privados.
      </p>
      {!claim && !verified && (
        <form onSubmit={start} noValidate>
          <Field id="claim-handle" label="Tu @handle de Instagram" error={errors.handle}>
            <input
              {...describe('claim-handle', errors.handle)}
              value={handle}
              autoComplete="off"
              placeholder="@tu.cuenta"
              onChange={(e) => setHandle(e.target.value)}
            />
          </Field>
          <Field id="claim-role" label="Quiero usarlo como" error={errors.role}>
            <select
              {...describe('claim-role', errors.role)}
              value={role}
              onChange={(e) => setRole(e.target.value === 'brand' ? 'brand' : 'creator')}
            >
              <option value="creator">Creador</option>
              <option value="brand">Marca</option>
            </select>
          </Field>
          <button className="btn" type="submit" disabled={busy}>
            Obtener código
          </button>
        </form>
      )}
      {claim && !verified && (
        <div className="stack">
          <p>
            Pega este código en la biografía de <strong>@{claim.handle}</strong>. Vale{' '}
            {CLAIM_TTL_MINUTES} minutos.
          </p>
          <p className="row">
            <code className="code" id="claim-code">
              {claim.code}
            </code>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={copy}
              aria-describedby="claim-code"
            >
              Copiar código
            </button>
          </p>
          {PUBLIC_API_MODE === 'mock' && (
            <p className="muted small">
              Modo demo: el primer intento de verificación falla a propósito. Los handles con
              “privado” o “personal” simulan cuentas no elegibles.
            </p>
          )}
          <button type="button" className="btn" onClick={verify} disabled={busy}>
            Verificar
          </button>
        </div>
      )}
      <div aria-live="polite">{outcome && <Alert kind={outcome.kind}>{outcome.text}</Alert>}</div>
      {verified && (
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Actualizar mi panel
        </button>
      )}
    </section>
  );
}
