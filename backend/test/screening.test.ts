import { describe, expect, test } from "bun:test";
import { screen, type ScreenInput } from "../src/screening/screen";

const reg = (id: number, groupCode: string, subjectCode: string, o: Partial<ScreenInput["registrations"][number]> = {}) => ({
  id, groupCode, subjectCode, subjectName: "", periodsPerWeek: 3,
  sourceFile: "subjects.xlsx", sourceSheet: "กลุ่มวิชา", sourceRow: id + 1, dupRows: "", review: "", ...o,
});

function base(): ScreenInput {
  return {
    groups: [
      { code: "662010101", name: "ช่างยนต์ 1", major: "ช่างยนต์", registered: 1, review: "", students: null },
      { code: "672010102", name: "672010102", major: null, registered: 0, review: "", students: null },
      { code: "กรณีพิเศษ", name: "กรณีพิเศษ", major: null, registered: 0, review: "", students: null },
    ],
    subjects: [
      { code: "20101-2001", name: "งานยนต์", roomType: null },
      { code: "20101-2002", name: "ไฟฟ้ายนต์", roomType: null },
    ],
    registrations: [
      reg(1, "662010101", "20101-2001"),                         // ready
      reg(2, "672010102", "20101-2001"),                         // not registered
      reg(3, "662010101", "20101-2002"),                         // invalid: no main teacher
      reg(4, "กรณีพิเศษ", "20101-2001"),                         // pending: special code
      reg(5, "662010101", "20101-2001", { id: 5, groupCode: "662010101", subjectCode: "20101-2001" }),
    ].slice(0, 4).concat([reg(5, "662010101", "20101-9999", { dupRows: "40" })]), // pending: duplicate rows
    failedRows: [{ id: 9, fileName: "subjects.xlsx", sheet: "กลุ่มวิชา", rowNo: 77, data: { รหัสวิชาเรียน: "20101-2001", รหัสกลุ่มเรียน: "662010101", คาบเรียนต่อสัปดาห์: "abc" }, parseError: "คาบเรียนต่อสัปดาห์ไม่ถูกต้อง (abc)" }],
    teachers: [{ id: 1, name: "ครูเอ" }, { id: 2, name: "ครูบี" }],
    teacherSubjects: [
      { teacherId: 1, subjectCode: "20101-2001", subjectName: "งานยนต์", role: "ผู้สอนหลัก" },
      { teacherId: 2, subjectCode: "20101-2002", subjectName: "ไฟฟ้ายนต์", role: "ผู้สอนร่วม" },
      { teacherId: 1, subjectCode: "20101-9999", subjectName: "", role: "ผู้สอนหลัก" },
    ],
    buildings: ["อาคารอุตสาหกรรม", "อาคารเรียนรวม"],
    rooms: [],
  };
}

const statusOf = (r: ReturnType<typeof screen>, id: string) => r.items.find((i) => i.id === id)!.status;

describe("pre-scheduling filter", () => {
  test("classifies into the 4 statuses", () => {
    const r = screen(base());
    expect(statusOf(r, "gs-1")).toBe("READY_TO_SCHEDULE");
    expect(statusOf(r, "gs-2")).toBe("NOT_REGISTERED");
    expect(statusOf(r, "gs-3")).toBe("INVALID_DATA");
    expect(statusOf(r, "gs-4")).toBe("PENDING_REVIEW");
    expect(statusOf(r, "gs-5")).toBe("PENDING_REVIEW");
    expect(statusOf(r, "src-9")).toBe("INVALID_DATA");
  });

  test("summary counts and hours", () => {
    const r = screen(base());
    expect(r.summary).toMatchObject({
      total: 6, ready: 1, notRegistered: 1, invalid: 2, pending: 2,
      readyHours: 3, notRegisteredHours: 3, registeredGroups: 1,
    });
  });

  test("every issue carries cause, source location and step-by-step fix", () => {
    const r = screen(base());
    for (const it of r.items.filter((i) => i.status !== "READY_TO_SCHEDULE")) {
      expect(it.issues.length).toBeGreaterThan(0);
      expect(it.source).not.toBeNull();
      for (const x of it.issues) {
        expect(x.cause.length).toBeGreaterThan(0);
        expect(x.fix.length).toBeGreaterThanOrEqual(2);
      }
    }
    const bad = r.items.find((i) => i.id === "src-9")!;
    expect(bad.source).toEqual({ file: "subjects.xlsx", sheet: "กลุ่มวิชา", row: 77 });
    expect(bad.issues[0]!.cause).toContain("abc");
  });

  test("approving a pending item makes it ready; token changes", () => {
    const before = screen(base());
    const input = base();
    input.registrations.find((x) => x.id === 5)!.review = "approved";
    input.groups.find((g) => g.code === "กรณีพิเศษ")!.review = "approved";
    const after = screen(input);
    expect(statusOf(after, "gs-5")).toBe("READY_TO_SCHEDULE");
    expect(statusOf(after, "gs-4")).toBe("READY_TO_SCHEDULE");
    expect(after.token).not.toBe(before.token);
  });

  test("fixing data (adding a main teacher) re-screens to ready", () => {
    const input = base();
    input.teacherSubjects.push({ teacherId: 2, subjectCode: "20101-2002", subjectName: "ไฟฟ้ายนต์", role: "ผู้สอนหลัก" });
    expect(statusOf(screen(input), "gs-3")).toBe("READY_TO_SCHEDULE");
  });

  test("teacher must match code AND the group's subject name", () => {
    const input = base();
    input.registrations[0]!.subjectName = "งานยนต์ขั้นสูง"; // group registered a different name for the same code
    const r = screen(input);
    expect(statusOf(r, "gs-1")).toBe("INVALID_DATA");
    expect(r.items.find((i) => i.id === "gs-1")!.issues[0]!.cause).toContain("ชื่อวิชาต่างกัน");
  });

  test("group over 40 periods is invalid", () => {
    const input = base();
    input.registrations[0]!.periodsPerWeek = 41;
    expect(statusOf(screen(input), "gs-1")).toBe("INVALID_DATA");
  });
});
