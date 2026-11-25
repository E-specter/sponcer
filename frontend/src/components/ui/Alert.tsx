import type { ReactNode } from 'react';
import { Notice } from './Notice';

/** Compatibilidad con las islas existentes: delega en `Notice`. */
export function Alert({
  kind,
  children,
}: {
  kind: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  return <Notice kind={kind}>{children}</Notice>;
}
