/** Specification (ADR-003): filtro duro combinable. En F2 cada una tiene su traducción a `WHERE`. */
export interface Specification<T> {
  isSatisfiedBy(candidate: T): boolean;
}

export const spec = <T>(predicate: (candidate: T) => boolean): Specification<T> => ({
  isSatisfiedBy: predicate,
});

/** Conjunción; sin especificaciones acepta todo. */
export const allOf = <T>(...specs: Array<Specification<T>>): Specification<T> =>
  spec((c) => specs.every((s) => s.isSatisfiedBy(c)));
