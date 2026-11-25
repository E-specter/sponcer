import { CircleAlert, CircleCheck, Info, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

export type NoticeKind = 'privacidad' | 'info' | 'error' | 'success';

const ICON = {
  privacidad: ShieldCheck,
  info: Info,
  error: CircleAlert,
  success: CircleCheck,
} as const;
const ICON_SIZE = 18;

interface NoticeProps {
  kind: NoticeKind;
  title?: string;
  children: ReactNode;
}

/** Aviso. Los errores se anuncian de inmediato (role=alert); el resto de forma educada (role=status). */
export function Notice({ kind, title, children }: NoticeProps) {
  const Icon = ICON[kind];
  const cls = kind === 'privacidad' ? 'notice' : `alert alert-${kind}`;
  return (
    <div className={cls} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon size={ICON_SIZE} strokeWidth={2} aria-hidden="true" />
      <div>
        {title && <strong className="notice-title">{title}</strong>}
        <span className={title ? 'notice-text' : undefined}>{children}</span>
      </div>
    </div>
  );
}
