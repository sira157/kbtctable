/** C. Smart Auto Filter — pure predicate shared by the screening page (and its tests). */
export interface FilterableItem {
  status: string; groupCode: string; groupName: string; subjectCode: string; subjectName: string;
  periods: number | null; department: string | null; mainTeachers: string[]; coTeachers: string[];
  issues: { type: string }[];
}
export interface Filters {
  code?: string; name?: string; teacher?: string; group?: string;
  statuses?: Set<string>; issue?: string; department?: string; periods?: string;
}

const has = (v: string, q: string) => v.toLowerCase().includes(q.trim().toLowerCase());

export function matches(i: FilterableItem, f: Filters): boolean {
  return (
    (!f.code || has(i.subjectCode, f.code)) &&
    (!f.name || has(i.subjectName, f.name)) &&
    (!f.teacher || [...i.mainTeachers, ...i.coTeachers].some((t) => has(t, f.teacher!))) &&
    (!f.group || has(i.groupCode, f.group) || has(i.groupName, f.group)) &&
    (!f.statuses?.size || f.statuses.has(i.status)) &&
    (!f.issue || i.issues.some((x) => x.type === f.issue)) &&
    (!f.department || (i.department ?? "ไม่ทราบแผนก") === f.department) &&
    (!f.periods || String(i.periods) === f.periods)
  );
}
