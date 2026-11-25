const INITIALS = 2;

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

/** Tamaños 32 / 40 / 48 / 64 px (definidos en global.css). */
const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: 'avatar avatar-32',
  md: 'avatar',
  lg: 'avatar avatar-48',
  xl: 'avatar avatar-64',
};

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: AvatarSize;
}

export const initialsOf = (name: string): string =>
  name
    .split(' ')
    .filter((w) => w.toLowerCase() !== w.toUpperCase())
    .map((w) => w[0])
    .join('')
    .slice(0, INITIALS)
    .toUpperCase();

/** Retrato o iniciales sobre tinta; siempre va junto al nombre, por eso es decorativo. */
export function Avatar({ name, src, size = 'md' }: AvatarProps) {
  const cls = SIZE_CLASS[size];
  return src ? (
    <img className={cls} src={src} alt="" />
  ) : (
    <span className={cls} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}
