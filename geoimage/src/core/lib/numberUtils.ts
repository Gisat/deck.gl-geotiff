export function toF32(n: number): number {
  return new Float32Array([n])[0];
}

export function isF32NoData(val: number, noData?: number | null): boolean {
  if (noData === undefined || noData === null) return false;
  const a = toF32(val);
  const b = toF32(noData as number);
  if (Number.isNaN(b)) return Number.isNaN(a);
  return a === b;
}
