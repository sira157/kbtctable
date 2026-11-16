import type { FileType, ParseResult, Sheet } from "../types";
import { parseBuildings } from "./buildings";
import { parseClassGroups } from "./classGroups";
import { parseSubjects } from "./subjects";
import { parseTeachers } from "./teachers";

export const parsers: Record<FileType, (sheets: Sheet[]) => ParseResult> = {
  class_groups: parseClassGroups,
  subjects: parseSubjects,
  teachers: parseTeachers,
  buildings: parseBuildings,
};
