/**
 * Guess a group's major from its code (ปี-ระดับ-ประเภทวิชา-สาขา-ห้อง, e.g. 66-2-01-01-01)
 * by matching known groups: same level+type+major first, then same type+major (any level).
 */
export function guessMajor(code: string, known: { code: string; major: string | null }[]): string | null {
  if (!/^\d{9}$/.test(code)) return null;
  const withMajor = known.filter((g) => g.major && /^\d{9}$/.test(g.code));
  const byLevel = withMajor.find((g) => g.code.slice(2, 7) === code.slice(2, 7));
  if (byLevel) return byLevel.major;
  const byType = withMajor.find((g) => g.code.slice(3, 7) === code.slice(3, 7));
  return byType?.major ?? null;
}
