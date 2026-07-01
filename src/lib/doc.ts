import type { Doc } from "../types";

/** A blank document with sane defaults — the base every load/import merges onto. */
export function defaultDoc(): Doc {
  return {
    location: null,
    northDeg: 0,
    comfort: 24,
    ceilingH: 2.5,
    fanCount: 2,
    pxPerM: 50,
    canSealFan: false,
    rooms: [],
    windows: [],
    doors: [],
  };
}

/** Rooms loaded/seeded/imported without an explicit `measured` flag are treated as real readings. */
export function markLoadedRoomsMeasured(d: Doc): Doc {
  d.rooms.forEach((r) => {
    if (r.measured === undefined) r.measured = true;
  });
  return d;
}
