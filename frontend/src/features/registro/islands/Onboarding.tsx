import { useEffect, useRef, useState, type ReactNode, type SubmitEvent } from 'react';
import {
  CITIES,
  CONSENT_VERSION,
  CompanyInput,
  InfluencerInput,
  MAX_SHORT_TEXT,
  RegisterRequest,
  documentError,
  type AccountKind,
  type City,
  type DocumentType,
  type PersonType,
} from '@sponcer/contracts';
import { Alert } from '../../../components/ui/Alert';
import { Field, describe } from '../../../components/ui/Field';
import { fieldErrors, messageOf } from '../../../components/ui/errors';
import { CITY_LABEL } from '../../../lib/labels';
import ClaimFlow from '../../panel/islands/ClaimFlow';
import { register } from '../../panel/api/panel';

// Todo lo que no es dígito: se quita al escribir el DNI o RUC.
// Acepta (para quitar) la "A" de "20A"; no toca "20".
// Probar: https://regex101.com/?regex=%5CD&testString=20A100&flavor=javascript
const NON_DIGITS = /\D/g;

type Step = 'type' | 'data' | 'consent' | 'claim';

const STEP_ORDER: Step[] = ['type', 'data', 'consent', 'claim'];
const STEP_LABEL: Record<Step, string> = {
  type: 'Tipo de cuenta',
  data: 'Tus datos',
  consent: 'Consentimiento',
  claim: 'Tu primer perfil',
};
const KIND_COPY: Record<AccountKind, { title: string; text: string }> = {
  company: {
    title: 'Empresa',
    text: 'Persona natural o jurídica que administra una o más marcas y cotiza a influencers.',
  },
  influencer: {
    title: 'Influencer',
    text: 'Administras una o más cuentas de Instagram y recibes cotizaciones de marcas.',
  },
};

/** Radio con su descripción, dentro de un fieldset. */
function Choice(p: {
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  children?: ReactNode;
}) {
  return (
    <label className="choice">
      <input type="radio" name={p.name} value={p.value} checked={p.checked} onChange={p.onChange} />
      <span>
        <strong>{p.title}</strong>
        {p.children && <span className="small muted"> {p.children}</span>}
      </span>
    </label>
  );
}

interface Props {
  /** `null` = registro pendiente; si ya hay tipo, se retoma en el primer perfil. */
  accountKind: AccountKind | null;
}

/** Registro completo (ADR-009): tipo de cuenta, datos, consentimiento y primer perfil. */
export default function Onboarding({ accountKind: initialKind }: Props) {
  const [step, setStep] = useState<Step>(initialKind ? 'claim' : 'type');
  const [kind, setKind] = useState<AccountKind | null>(initialKind);
  const [personType, setPersonType] = useState<PersonType>('juridica');
  const [documentType, setDocumentType] = useState<DocumentType>('ruc');
  const [documentNumber, setDocumentNumber] = useState('');
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [about, setAbout] = useState('');
  const [city, setCity] = useState<City | ''>('');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  // Al cambiar de paso el foco pasa al título para lectores de pantalla y teclado.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) firstRender.current = false;
    else heading.current?.focus();
  }, [step]);

  const liveDocumentError =
    documentNumber === ''
      ? undefined
      : (documentError(personType, documentType, documentNumber) ?? undefined);

  function pickPerson(next: PersonType) {
    setPersonType(next);
    if (next === 'juridica') setDocumentType('ruc');
  }

  function nextFromType(e: SubmitEvent) {
    e.preventDefault();
    if (!kind) return setErrors({ kind: 'Elige el tipo de cuenta.' });
    setErrors({});
    setStep('data');
  }

  function nextFromData(e: SubmitEvent) {
    e.preventDefault();
    const parsed =
      kind === 'company'
        ? CompanyInput.safeParse({
            personType,
            documentType,
            documentNumber,
            legalName,
            tradeName: tradeName.trim() || undefined,
            city,
          })
        : InfluencerInput.safeParse({ displayName, city, about: about.trim() || undefined });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setStep('consent');
  }

  async function submitConsent(e: SubmitEvent) {
    e.preventDefault();
    const consent = {
      acceptTerms: terms,
      acceptPrivacy: privacy,
      consentVersion: CONSENT_VERSION,
    };
    const parsed = RegisterRequest.safeParse(
      kind === 'company'
        ? {
            accountKind: 'company',
            company: {
              personType,
              documentType,
              documentNumber,
              legalName,
              tradeName: tradeName.trim() || undefined,
              city,
            },
            ...consent,
          }
        : {
            accountKind: 'influencer',
            influencer: { displayName, city, about: about.trim() || undefined },
            ...consent,
          },
    );
    if (!parsed.success) {
      return setErrors({
        consent: 'Para continuar acepta los términos y la política de privacidad.',
      });
    }
    setErrors({});
    setBusy(true);
    try {
      await register(parsed.data);
      setFailure(null);
      setStep('claim');
    } catch (err) {
      setFailure(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const cityField = (
    <Field id="reg-city" label="Ciudad" error={errors.city}>
      <select
        {...describe('reg-city', errors.city)}
        value={city}
        onChange={(e) => setCity(CITIES.find((c) => c === e.target.value) ?? '')}
      >
        <option value="">Elige tu ciudad</option>
        {CITIES.map((c) => (
          <option key={c} value={c}>
            {CITY_LABEL[c]}
          </option>
        ))}
      </select>
    </Field>
  );

  const stepIndex = STEP_ORDER.indexOf(step);
  return (
    <div className="stack">
      <ol className="stepper" aria-label="Pasos del registro">
        {STEP_ORDER.map((s, i) => (
          <li key={s} aria-current={s === step ? 'step' : undefined} data-done={i < stepIndex}>
            <span className="stepper-n" aria-hidden="true">
              {i + 1}
            </span>
            {STEP_LABEL[s]}
          </li>
        ))}
      </ol>

      <section className="card stack" aria-labelledby="reg-title">
        <h2 id="reg-title" ref={heading} tabIndex={-1}>
          {STEP_LABEL[step]}
        </h2>

        {step === 'type' && (
          <form onSubmit={nextFromType} noValidate>
            <fieldset aria-describedby={errors.kind ? 'reg-kind-error' : undefined}>
              <legend>¿Cómo vas a usar Sponcer?</legend>
              {(['company', 'influencer'] as const).map((k) => (
                <Choice
                  key={k}
                  name="accountKind"
                  value={k}
                  checked={kind === k}
                  onChange={() => setKind(k)}
                  title={KIND_COPY[k].title}
                >
                  {KIND_COPY[k].text}
                </Choice>
              ))}
              {errors.kind && (
                <p id="reg-kind-error" className="field-error">
                  {errors.kind}
                </p>
              )}
            </fieldset>
            <p className="small muted">El tipo de cuenta no se puede cambiar después.</p>
            <button type="submit" className="btn">
              Continuar
            </button>
          </form>
        )}

        {step === 'data' && kind === 'company' && (
          <form onSubmit={nextFromData} noValidate>
            <fieldset>
              <legend>Tipo de persona</legend>
              <Choice
                name="personType"
                value="juridica"
                checked={personType === 'juridica'}
                onChange={() => pickPerson('juridica')}
                title="Persona jurídica"
              >
                Se registra con RUC (empieza con 20).
              </Choice>
              <Choice
                name="personType"
                value="natural"
                checked={personType === 'natural'}
                onChange={() => pickPerson('natural')}
                title="Persona natural"
              >
                DNI, o RUC que empieza con 10.
              </Choice>
            </fieldset>
            {personType === 'natural' && (
              <Field id="reg-doc-type" label="Documento">
                <select
                  id="reg-doc-type"
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value === 'dni' ? 'dni' : 'ruc')}
                >
                  <option value="dni">DNI (8 dígitos)</option>
                  <option value="ruc">RUC (11 dígitos)</option>
                </select>
              </Field>
            )}
            <Field
              id="reg-doc"
              label={documentType === 'dni' ? 'Número de DNI' : 'Número de RUC'}
              hint="Solo validamos el formato y el dígito verificador; no consultamos a SUNAT ni a RENIEC."
              error={errors.documentNumber ?? liveDocumentError}
            >
              <input
                {...describe('reg-doc', errors.documentNumber ?? liveDocumentError)}
                inputMode="numeric"
                autoComplete="off"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value.replace(NON_DIGITS, ''))}
              />
            </Field>
            <Field
              id="reg-legal"
              label={personType === 'juridica' ? 'Razón social' : 'Nombre completo'}
              error={errors.legalName}
            >
              <input
                {...describe('reg-legal', errors.legalName)}
                autoComplete="organization"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
              />
            </Field>
            <Field id="reg-trade" label="Nombre comercial (opcional)" error={errors.tradeName}>
              <input
                {...describe('reg-trade', errors.tradeName)}
                value={tradeName}
                onChange={(e) => setTradeName(e.target.value)}
              />
            </Field>
            {cityField}
            <div className="row">
              <button type="button" className="btn btn-secondary" onClick={() => setStep('type')}>
                Atrás
              </button>
              <button type="submit" className="btn">
                Continuar
              </button>
            </div>
          </form>
        )}

        {step === 'data' && kind === 'influencer' && (
          <form onSubmit={nextFromData} noValidate>
            <Field id="reg-name" label="Tu nombre" error={errors.displayName}>
              <input
                {...describe('reg-name', errors.displayName)}
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </Field>
            {cityField}
            <Field
              id="reg-about"
              label="Sobre mí (opcional)"
              hint={`Hasta ${MAX_SHORT_TEXT} caracteres`}
              error={errors.about}
            >
              <textarea
                {...describe('reg-about', errors.about)}
                value={about}
                onChange={(e) => setAbout(e.target.value)}
              />
            </Field>
            <div className="row">
              <button type="button" className="btn btn-secondary" onClick={() => setStep('type')}>
                Atrás
              </button>
              <button type="submit" className="btn">
                Continuar
              </button>
            </div>
          </form>
        )}

        {step === 'consent' && (
          <form onSubmit={submitConsent} noValidate>
            <p>
              Guardamos tu aceptación con su fecha y la versión del texto ({CONSENT_VERSION}), como
              exige la Ley N.º 29733.
            </p>
            <fieldset aria-describedby={errors.consent ? 'reg-consent-error' : undefined}>
              <legend>Aceptaciones</legend>
              <label className="row">
                <input
                  type="checkbox"
                  checked={terms}
                  onChange={(e) => setTerms(e.target.checked)}
                />
                <span>
                  Acepto los{' '}
                  <a href="/terminos" target="_blank" rel="noopener">
                    términos de uso
                  </a>
                </span>
              </label>
              <label className="row">
                <input
                  type="checkbox"
                  checked={privacy}
                  onChange={(e) => setPrivacy(e.target.checked)}
                />
                <span>
                  Acepto la{' '}
                  <a href="/privacidad" target="_blank" rel="noopener">
                    política de privacidad
                  </a>
                  , incluido el registro de visitas a las fichas
                </span>
              </label>
              {errors.consent && (
                <p id="reg-consent-error" className="field-error">
                  {errors.consent}
                </p>
              )}
            </fieldset>
            <div aria-live="polite">{failure && <Alert kind="error">{failure}</Alert>}</div>
            <div className="row">
              <button type="button" className="btn btn-secondary" onClick={() => setStep('data')}>
                Atrás
              </button>
              <button type="submit" className="btn" disabled={busy}>
                Crear mi cuenta
              </button>
            </div>
          </form>
        )}

        {step === 'claim' && (
          <>
            <p>
              {kind === 'company'
                ? 'Último paso: reclama la cuenta de Instagram de tu marca. Podrás agregar más marcas luego desde Mi panel.'
                : 'Último paso: reclama tu cuenta de Instagram. Podrás agregar más cuentas luego desde Mi panel.'}
            </p>
            <ClaimFlow
              fixedRole={kind === 'company' ? 'brand' : 'creator'}
              after={{ href: '/panel', label: 'Ir a mi panel' }}
            />
          </>
        )}
      </section>
    </div>
  );
}
