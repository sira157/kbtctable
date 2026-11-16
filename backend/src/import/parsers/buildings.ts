import { ROOM_TYPES } from "../../db/schema";
import { HEADERS } from "../detect";
import { findCol, isBlankRow, positiveInt, text } from "../normalize";
import type { BuildingsData, ParseResult, Sheet } from "../types";
import { makeIssues, previewOf } from "./common";

type Room = BuildingsData["rooms"][number];

export function parseBuildings(sheets: Sheet[]): ParseResult {
  const { issues, error, warn } = makeIssues();
  const buildings = new Set<string>();
  const rooms = new Map<string, Room>();
  let hasExtra = false;

  for (const sheet of sheets) {
    const h = sheet.rows[0] ?? [];
    const bi = findCol(h, [...HEADERS.buildingName]);
    if (bi < 0) continue;
    const ri = findCol(h, [...HEADERS.roomCode]);
    const ci = findCol(h, [...HEADERS.capacity]);
    const ti = findCol(h, [...HEADERS.roomType]);
    if (ci >= 0 || ti >= 0) hasExtra = true;
    sheet.rows.slice(1).forEach((r, i) => {
      const row = i + 2;
      if (isBlankRow(r)) return;
      const b = text(r[bi]);
      const room = ri >= 0 ? text(r[ri]) : "";
      if (!b) return error(sheet.name, row, `ห้อง ${room}: ไม่มีชื่ออาคาร`);
      buildings.add(b);
      if (!room) return;
      let capacity: number | null = null;
      if (ci >= 0 && text(r[ci]) !== "") {
        capacity = positiveInt(r[ci]);
        if (capacity === null) warn(sheet.name, row, `ห้อง ${room}: ความจุ "${text(r[ci])}" ไม่ถูกต้อง (ถือว่าไม่จำกัด)`);
      }
      let roomType: string | null = ti >= 0 ? text(r[ti]) || null : null;
      if (roomType && !(ROOM_TYPES as readonly string[]).includes(roomType)) {
        warn(sheet.name, row, `ห้อง ${room}: ประเภทห้อง "${roomType}" ไม่รู้จัก (ต้องเป็น ${ROOM_TYPES.join(" / ")}) — ถือว่าใช้ได้ทุกวิชา`);
        roomType = null;
      }
      rooms.set(`${b}|${room}`, { buildingName: b, roomCode: room, capacity, roomType });
    });
  }

  const buildingList = [...buildings].map((name) => ({ name }));
  const roomList = [...rooms.values()];
  const preview: ParseResult["preview"] = { อาคารเรียน: previewOf(["name"], buildingList) };
  if (roomList.length) {
    preview["ห้องเรียน"] = previewOf(
      hasExtra ? ["buildingName", "roomCode", "capacity", "roomType"] : ["buildingName", "roomCode"], roomList,
    );
  }
  return {
    data: { type: "buildings", buildings: buildingList, rooms: roomList },
    issues,
    preview,
  };
}
