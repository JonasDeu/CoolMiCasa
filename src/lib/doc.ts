import type { Doc, FanSize } from "../types";
import { uid } from "./id";

/** A blank document with sane defaults — the base every load/import merges onto. */
export function defaultDoc(): Doc {
  return {
    location: null,
    northDeg: 0,
    comfort: 24,
    ceilingH: 2.5,
    fans: [
      { id: uid(), size: "medium" },
      { id: uid(), size: "medium" },
    ],
    canSealFan: false,
    mass: "medium",
    quickIndoorTemp: null,
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

/**
 * Normalize the `fans` field across save formats, mutating `raw` in place so the
 * caller can merge it straight onto {@link defaultDoc}. The current shape is a
 * `Fan[]` list; older v2 saves used a `fanCount` number plus a single `fanSize`,
 * and v1 stored a differently-shaped `fans` array — both collapse to one fan
 * object per owned unit, all sharing the old global size.
 */
export function migrateFans(raw: Record<string, unknown>): void {
  const cur = raw.fans;
  const alreadyFans =
    Array.isArray(cur) && cur.every((f) => f && typeof f === "object" && typeof (f as { size?: unknown }).size === "string");
  if (!alreadyFans) {
    const n = typeof raw.fanCount === "number" ? raw.fanCount : 2;
    const size = (typeof raw.fanSize === "string" ? raw.fanSize : "medium") as FanSize;
    const count = Math.max(0, Math.min(8, Math.round(n)));
    raw.fans = Array.from({ length: count }, () => ({ id: uid(), size }));
  }
  delete raw.fanCount;
  delete raw.fanSize;
}
