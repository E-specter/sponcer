interface LogoProps {
  /** `ink`: texto blanco para fondos tinta. */
  tone?: 'light' | 'ink';
  href?: string;
}

/** Sello (gradiente de firma + vínculo en blanco) y la palabra Sponcer. */
export function Logo({ tone = 'light', href = '/' }: LogoProps) {
  return (
    <a
      className={`logo ${tone === 'ink' ? 'logo-on-ink' : ''}`}
      href={href}
      aria-label="Sponcer, inicio"
    >
      <span className="logo-seal" aria-hidden="true">
        <img src="/assets/vinculo.svg" alt="" />
      </span>
      Sponcer
    </a>
  );
}
