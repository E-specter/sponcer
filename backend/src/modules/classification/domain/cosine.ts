const norm = (v: number[]): number => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

export function cosine(a: number[], b: number[]): number {
  const dot = a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
  const denom = norm(a) * norm(b);
  return denom ? dot / denom : 0;
}
