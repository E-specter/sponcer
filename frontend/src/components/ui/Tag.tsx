import type { ReactNode } from 'react';

export type TagTone = 'neutral' | 'accion' | 'exito' | 'error' | 'tinta';

/** Etiqueta de estado o procedencia. Siempre lleva texto: el color nunca es el único canal. */
export function Tag({ tone = 'neutral', children }: { tone?: TagTone; children: ReactNode }) {
  return <span className={tone === 'neutral' ? 'tag' : `tag tag-${tone}`}>{children}</span>;
}
