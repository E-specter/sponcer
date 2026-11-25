import { useState, type SubmitEvent } from 'react';
import {
  MAX_SERVICES,
  MAX_SHORT_TEXT,
  PutServicesRequest,
  SERVICE_FORMATS,
  SERVICE_TYPES,
  type Service,
  type ServiceFormat,
  type ServiceType,
} from '@sponcer/contracts';
import { Alert } from '../../../components/ui/Alert';
import { Field, describe } from '../../../components/ui/Field';
import { fieldErrors, messageOf } from '../../../components/ui/errors';
import { SERVICE_FORMAT_LABEL, SERVICE_TYPE_LABEL } from '../../../lib/labels';
import { putServices } from '../api/panel';

interface Row {
  key: string;
  type: ServiceType;
  format: ServiceFormat;
  price: string;
  description: string;
}

const newRow = (): Row => ({
  key: crypto.randomUUID(),
  type: SERVICE_TYPES[0],
  format: SERVICE_FORMATS[0],
  price: '',
  description: '',
});

export default function ServicesEditor({
  profileId,
  initial,
}: {
  profileId: string;
  initial: Service[];
}) {
  const [rows, setRows] = useState<Row[]>(
    initial.map((s) => ({
      key: s.id,
      type: s.type,
      format: s.format,
      price: String(s.pricePen),
      description: s.description,
    })),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const patch = (key: string, change: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...change } : r)));

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const parsed = PutServicesRequest.safeParse({
      services: rows.map((r) => ({
        type: r.type,
        format: r.format,
        pricePen: r.price === '' ? undefined : Number(r.price),
        description: r.description,
      })),
    });
    if (!parsed.success) {
      setStatus(null);
      return setErrors(fieldErrors(parsed.error));
    }
    setErrors({});
    try {
      await putServices(profileId, parsed.data);
      setStatus({ kind: 'success', text: 'Servicios guardados.' });
    } catch (err) {
      setStatus({ kind: 'error', text: messageOf(err) });
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Servicios" className="stack">
      {errors.services && <p className="field-error">{errors.services}</p>}
      {rows.length === 0 && <p className="muted">Aún no tienes servicios.</p>}
      {rows.map((r, i) => {
        const id = (n: string) => `${r.key}-${n}`;
        const err = (n: string) => errors[`services.${i}.${n}`];
        return (
          <fieldset key={r.key}>
            <legend>Servicio {i + 1}</legend>
            <Field id={id('type')} label="Tipo" error={err('type')}>
              <select
                {...describe(id('type'), err('type'))}
                value={r.type}
                onChange={(e) =>
                  patch(r.key, { type: SERVICE_TYPES.find((t) => t === e.target.value) ?? r.type })
                }
              >
                {SERVICE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SERVICE_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={id('format')} label="Formato" error={err('format')}>
              <select
                {...describe(id('format'), err('format'))}
                value={r.format}
                onChange={(e) =>
                  patch(r.key, {
                    format: SERVICE_FORMATS.find((f) => f === e.target.value) ?? r.format,
                  })
                }
              >
                {SERVICE_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {SERVICE_FORMAT_LABEL[f]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={id('price')} label="Precio (S/)" error={err('pricePen')}>
              <input
                {...describe(id('price'), err('pricePen'))}
                type="number"
                min={0}
                value={r.price}
                onChange={(e) => patch(r.key, { price: e.target.value })}
              />
            </Field>
            <Field
              id={id('desc')}
              label="Descripción"
              error={err('description')}
              hint={`Hasta ${MAX_SHORT_TEXT} caracteres`}
            >
              <textarea
                {...describe(id('desc'), err('description'))}
                value={r.description}
                onChange={(e) => patch(r.key, { description: e.target.value })}
              />
            </Field>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
            >
              Quitar servicio {i + 1}
            </button>
          </fieldset>
        );
      })}
      <div className="row">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={rows.length >= MAX_SERVICES}
          onClick={() => setRows((prev) => [...prev, newRow()])}
        >
          Agregar servicio
        </button>
        <button type="submit" className="btn">
          Guardar servicios
        </button>
      </div>
      <div aria-live="polite">{status && <Alert kind={status.kind}>{status.text}</Alert>}</div>
    </form>
  );
}
