import type { Doc, Room, Weather } from "../types";
import { angDiff, windowFacing } from "./geometry";
import { nowHour, sunOnWindow } from "./recommend";

export interface RoomTemp {
  /** Effective temperature to use everywhere in the logic, °C. */
  value: number;
  /** True when this is a model estimate rather than a real reading. */
  estimated: boolean;
}

export type RoomTempMap = Record<string, RoomTemp>;

function isMeasured(r: Room): boolean {
  return r.measured !== false && Number.isFinite(+r.temp);
}

/**
 * Effective indoor temperature for every room.
 *
 * Rooms with a real reading are passed through. Rooms without a sensor are
 * estimated from the measured rooms (or the outdoor air as a fallback) and
 * nudged up for solar gain — a room the sun is hitting, or one facing the hot
 * south/west, runs warmer than a shaded north room.
 */
export function computeRoomTemps(doc: Doc, weather: Weather | null): RoomTempMap {
  const h = nowHour(weather);
  const out: RoomTempMap = {};

  const measured = doc.rooms.filter(isMeasured);
  const avgMeasured = measured.length
    ? measured.reduce((a, r) => a + +r.temp, 0) / measured.length
    : null;

  for (const r of doc.rooms) {
    if (isMeasured(r)) {
      out[r.id] = { value: +r.temp, estimated: false };
      continue;
    }

    // Baseline: the measured rooms, else a bit above the current outdoor air.
    let base: number;
    if (avgMeasured != null) base = avgMeasured;
    else if (h) base = h.temp + 2;
    else base = +doc.comfort;

    // Solar bump from this room's own windows.
    let bump = 0;
    for (const w of doc.windows) {
      if (w.roomId !== r.id) continue;
      const facing = windowFacing(w, doc.northDeg);
      if (h && sunOnWindow(w, h.sun, doc.northDeg) && h.rad > 120) {
        bump += 1.4; // sun is on this glass right now
      } else {
        // standing bias: south/west glass banks daytime heat
        const south = 180,
          west = 270;
        if (angDiff(facing, south) < 50 || angDiff(facing, west) < 50) bump += 0.4;
      }
    }
    // a windowless interior room barely gains; clamp the bump
    bump = Math.min(bump, 3.5);

    out[r.id] = { value: Math.round((base + bump) * 10) / 10, estimated: true };
  }
  return out;
}

/** Build a copy of the document whose room temps are the effective values. */
export function withEffectiveTemps(doc: Doc, temps: RoomTempMap): Doc {
  return {
    ...doc,
    rooms: doc.rooms.map((r) => ({ ...r, temp: temps[r.id]?.value ?? r.temp })),
  };
}
