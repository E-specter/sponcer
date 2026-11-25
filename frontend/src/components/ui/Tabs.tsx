export interface TabLink {
  href: string;
  label: string;
}

/** Pestañas de navegación: la activa lleva `aria-current` (texto violeta 600 y subrayado). */
export function Tabs({
  links,
  current,
  label,
}: {
  links: TabLink[];
  current: string;
  label: string;
}) {
  return (
    <nav className="header-tabs" aria-label={label}>
      {links.map((l) => (
        <a
          key={l.href}
          href={l.href}
          aria-current={current.startsWith(l.href) ? 'page' : undefined}
        >
          {l.label}
        </a>
      ))}
    </nav>
  );
}
