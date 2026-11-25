import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'text' | 'danger';

const CLASS: Record<Variant, string> = {
  primary: 'btn',
  secondary: 'btn btn-secondary',
  text: 'btn btn-text',
  danger: 'btn btn-danger',
};

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: Variant;
  block?: boolean;
  /** Con `href` se renderiza un enlace con el mismo aspecto. */
  href?: string;
  children: ReactNode;
}

export function Button({ variant = 'primary', block, href, children, ...rest }: ButtonProps) {
  const cls = `${CLASS[variant]}${block ? ' btn-block' : ''}`;
  return href ? (
    <a className={cls} href={href}>
      {children}
    </a>
  ) : (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}
