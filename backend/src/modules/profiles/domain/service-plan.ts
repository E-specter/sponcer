import type { Service, ServiceInput } from '@sponcer/contracts';

const sameContent = (a: ServiceInput, b: ServiceInput): boolean =>
  a.type === b.type &&
  a.format === b.format &&
  a.pricePen === b.pricePen &&
  a.description === b.description;

export interface ServicePlan {
  /** Por posición de entrada: id existente a actualizar o `null` para insertar. */
  assign: Array<string | null>;
  /** Ids existentes que ya no se usan. */
  remove: string[];
}

/**
 * Decide qué filas reutilizar para no cambiar ids (FK de quotes): primero las idénticas,
 * luego las sobrantes por orden; lo que falte se inserta y lo que sobre se borra.
 */
export function planServiceReplace(existing: Service[], input: ServiceInput[]): ServicePlan {
  const free = [...existing];
  const assign: Array<string | null> = input.map(() => null);
  input.forEach((s, i) => {
    const at = free.findIndex((e) => sameContent(e, s));
    if (at >= 0) assign[i] = free.splice(at, 1)[0]!.id;
  });
  assign.forEach((id, i) => {
    if (id === null && free.length) assign[i] = free.shift()!.id;
  });
  return { assign, remove: free.map((e) => e.id) };
}
