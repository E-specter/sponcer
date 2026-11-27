import { useEffect, useState, type SubmitEvent } from 'react';
import {
  CreateQuoteRequest,
  MAX_QUOTE_MESSAGE,
  MIN_NAME,
  type Campaign,
  type CreateQuotesResult,
  type ProfileSummary,
  type Service,
} from '@sponcer/contracts';
import { Alert } from '../../../components/ui/Alert';
import { Field, describe } from '../../../components/ui/Field';
import { fieldErrors, messageOf } from '../../../components/ui/errors';
import {
  SERVICE_FORMAT_LABEL,
  SERVICE_TYPE_LABEL,
  QUOTE_STATUS_LABEL,
  formatPen,
} from '../../../lib/labels';
import { createCampaign, createQuotes, listCampaigns, loadProfile } from '../api/campaigns';

const NEW_CAMPAIGN = '__new__';
const DATE_LENGTH = 10;
const QUICK_NAME_MAX = 80;

const serviceText = (s: Service): string =>
  `${SERVICE_TYPE_LABEL[s.type]} · ${SERVICE_FORMAT_LABEL[s.format]} · ${formatPen(s.pricePen)}`;

interface Props {
  brandProfileId: string;
  targets: ProfileSummary[];
  /** Campaña fija (se cotiza desde su detalle): no se ofrece elegir ni crear. */
  campaignId?: string;
  /** Servicio preseleccionado cuando hay un solo destinatario. */
  initialServiceId?: string;
  onDone?: (result: CreateQuotesResult) => void;
}

/**
 * Cotización a uno o varios influencers (ADR-009): campaña activa (o una rápida), servicio del catálogo
 * o propuesta abierta por destinatario, y un mensaje y monto comunes. Muestra creadas y fallidas.
 */
export default function QuoteComposer({
  brandProfileId,
  targets,
  campaignId,
  initialServiceId,
  onDone,
}: Props) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaign, setCampaign] = useState(campaignId ?? '');
  const [quickName, setQuickName] = useState('');
  const [services, setServices] = useState<Record<string, Service[]>>({});
  const [picked, setPicked] = useState<Record<string, string>>(
    initialServiceId && targets[0] ? { [targets[0].id]: initialServiceId } : {},
  );
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CreateQuotesResult | null>(null);

  useEffect(() => {
    if (campaignId) return;
    let cancelled = false;
    (async () => {
      try {
        const page = await listCampaigns(brandProfileId, 'active');
        if (cancelled) return;
        setCampaigns(page.items);
        setCampaign((cur) => cur || page.items[0]?.id || NEW_CAMPAIGN);
      } catch (e) {
        if (!cancelled) setFailure(messageOf(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brandProfileId, campaignId]);

  const targetKey = targets.map((t) => t.handle).join(',');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await Promise.all(
        targets.map(async (t) => {
          try {
            return [t.id, (await loadProfile(t.handle)).services] as const;
          } catch {
            return [t.id, []] as const;
          }
        }),
      );
      if (!cancelled) setServices(Object.fromEntries(loaded));
    })();
    return () => {
      cancelled = true;
    };
  }, [targetKey]);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    setFailure(null);
    const quick = campaign === NEW_CAMPAIGN;
    if (quick && quickName.trim().length < MIN_NAME) {
      return setErrors({ campaign: `Escribe un nombre de al menos ${MIN_NAME} caracteres.` });
    }
    setBusy(true);
    try {
      const campaignToUse = quick
        ? (
            await createCampaign({
              brandProfileId,
              name: quickName,
              kind: 'other',
              startsOn: new Date().toISOString().slice(0, DATE_LENGTH),
              activate: true,
            })
          ).id
        : campaign;
      const parsed = CreateQuoteRequest.safeParse({
        requesterProfileId: brandProfileId,
        campaignId: campaignToUse,
        targets: targets.map((t) => ({
          creatorProfileId: t.id,
          serviceId: picked[t.id] || undefined,
        })),
        message,
        amountPen: amount === '' ? undefined : Number(amount),
        send: true,
      });
      if (!parsed.success) return setErrors(fieldErrors(parsed.error));
      setErrors({});
      const out = await createQuotes(parsed.data);
      setResult(out);
      onDone?.(out);
    } catch (err) {
      setFailure(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const handleOf = (id: string) => targets.find((t) => t.id === id)?.handle ?? id;
    return (
      <div className="stack" aria-live="polite">
        {result.created.length > 0 && (
          <Alert kind="success">
            Cotizaciones creadas ({result.created.length}):{' '}
            {result.created
              .map((q) => `@${q.creator.handle} (${QUOTE_STATUS_LABEL[q.status]})`)
              .join(', ')}
            .
          </Alert>
        )}
        {result.failed.length > 0 && (
          <Alert kind="error">
            No se pudo cotizar a:{' '}
            {result.failed.map((f) => `@${handleOf(f.creatorProfileId)}: ${f.message}`).join(' · ')}
          </Alert>
        )}
        <a className="btn btn-secondary" href="/panel/cotizaciones">
          Ver mis cotizaciones
        </a>
      </div>
    );
  }

  const key = (n: string) => `qc-${targets[0]?.id ?? 'x'}-${n}`;
  return (
    <form onSubmit={submit} noValidate aria-label="Cotizar">
      {!campaignId && (
        <>
          <Field id={key('campaign')} label="Campaña" error={errors.campaignId ?? errors.campaign}>
            <select
              {...describe(key('campaign'), errors.campaignId ?? errors.campaign)}
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={NEW_CAMPAIGN}>Crear una campaña rápida…</option>
            </select>
          </Field>
          {campaign === NEW_CAMPAIGN && (
            <Field
              id={key('quick')}
              label="Nombre de la nueva campaña"
              hint="Se crea activa; luego puedes completar sus datos."
              error={errors.campaign}
            >
              <input
                {...describe(key('quick'), errors.campaign)}
                value={quickName}
                maxLength={QUICK_NAME_MAX}
                onChange={(e) => setQuickName(e.target.value)}
              />
            </Field>
          )}
        </>
      )}
      {targets.map((t) => (
        <Field key={t.id} id={key(`svc-${t.id}`)} label={`Servicio para @${t.handle}`}>
          <select
            id={key(`svc-${t.id}`)}
            value={picked[t.id] ?? ''}
            onChange={(e) => setPicked((p) => ({ ...p, [t.id]: e.target.value }))}
          >
            <option value="">Propuesta abierta (sin servicio)</option>
            {(services[t.id] ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {serviceText(s)}
              </option>
            ))}
          </select>
        </Field>
      ))}
      <Field
        id={key('msg')}
        label="Mensaje"
        error={errors.message}
        hint={`Hasta ${MAX_QUOTE_MESSAGE} caracteres`}
      >
        <textarea
          {...describe(key('msg'), errors.message)}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </Field>
      <Field id={key('amt')} label="Monto propuesto en S/ (opcional)" error={errors.amountPen}>
        <input
          {...describe(key('amt'), errors.amountPen)}
          type="number"
          min={0}
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      {errors.targets && <p className="field-error">{errors.targets}</p>}
      <div aria-live="polite">{failure && <Alert kind="error">{failure}</Alert>}</div>
      <button type="submit" className="btn" disabled={busy || targets.length === 0}>
        {targets.length > 1 ? `Enviar a ${targets.length} influencers` : 'Enviar cotización'}
      </button>
    </form>
  );
}
