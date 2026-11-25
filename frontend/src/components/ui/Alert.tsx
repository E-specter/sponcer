import type { ReactNode } from 'react';

interface AlertProps {
  kind: 'error' | 'success' | 'info';
  children: ReactNode;
}

/** Los errores se anuncian de inmediato (role=alert); el resto de forma educada (role=status). */
export function Alert({ kind, children }: AlertProps) {
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
