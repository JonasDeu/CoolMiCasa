import type { Doc, Hour, Room, SunPos, Weather, WindowItem } from "../types";
import { angDiff, compassName, roomById, windowFacing } from "./geometry";

export function nowHour(weather: Weather | null): Hour | null {
  return weather ? weather.hours[weather.nowIdx] : null;
}

export function maxIndoor(rooms: Room[]): number | null {
  return rooms.length ? Math.max(...rooms.map((r) => +r.temp || 0)) : null;
}

/** Is opening windows beneficial at outdoorT given indoorT and the comfort target? */
export function ventilate(
  outdoorT: number | null,
  indoorT: number | null,
  comfort: number,
): boolean {
  if (outdoorT == null || indoorT == null) return false;
  return outdoorT <= indoorT - 1 && indoorT > comfort - 0.5
    ? true
    : outdoorT <= indoorT - 1 && outdoorT < comfort;
}

export function sunOnWindow(win: WindowItem, sun: SunPos | null, northDeg: number): boolean {
  if (!sun || sun.altitude <= 1) return false;
  return angDiff(sun.azimuth, windowFacing(win, northDeg)) < 85;
}

export interface HourClass {
  vent: boolean;
  anySun: boolean;
  temp: number;
}

/** Classify an hour for a representative indoor temp. */
export function classifyHour(
  h: Hour,
  indoorT: number | null,
  comfort: number,
  windows: WindowItem[],
  northDeg: number,
): HourClass {
  const vent = ventilate(h.temp, indoorT, comfort);
  let anySun = false;
  for (const w of windows) {
    if (sunOnWindow(w, h.sun, northDeg) && h.rad > 120) {
      anySun = true;
      break;
    }
  }
  return { vent, anySun, temp: h.temp };
}

export type WindRole = "calm" | "windward" | "leeward" | "side";

/** Wind relationship for a window facing `facing`, wind coming FROM windDir. */
export function windRole(facing: number, windDir: number, windSpd: number): WindRole {
  if (windSpd == null || windSpd < 3) return "calm";
  const d = angDiff(facing, windDir);
  if (d < 60) return "windward"; // wind blows into this window -> intake
  if (d > 120) return "leeward"; // -> exhaust
  return "side";
}

/** Windows we would actually have open right now (ventilate mode, not sun-blasted). */
export function openWindowsNow(doc: Doc, weather: Weather | null): WindowItem[] {
  const h = nowHour(weather);
  if (!h) return [];
  const comfort = +doc.comfort;
  return doc.windows.filter((w) => {
    const r = roomById(doc.rooms, w.roomId);
    const indoorT = r ? +r.temp : maxIndoor(doc.rooms);
    const outT = w.temp != null ? +w.temp : h.temp;
    const sunHit = sunOnWindow(w, h.sun, doc.northDeg) && h.rad > 120;
    return !sunHit && ventilate(outT, indoorT, comfort);
  });
}

export function hasCrossVentilation(windows: WindowItem[], northDeg: number): boolean {
  const facings = windows.map((w) => windowFacing(w, northDeg));
  for (let i = 0; i < facings.length; i++)
    for (let j = i + 1; j < facings.length; j++)
      if (angDiff(facings[i], facings[j]) > 120) return true;
  return false;
}

export function leewardSideName(windows: WindowItem[], weather: Weather, northDeg: number): string | null {
  const wd = weather.current.windDir;
  let best: WindowItem | null = null,
    bd = -1;
  for (const w of windows) {
    const d = angDiff(windowFacing(w, northDeg), wd);
    if (d > bd) {
      bd = d;
      best = w;
    }
  }
  return best ? compassName(windowFacing(best, northDeg)) : null;
}

export function fmt(v: number | null | undefined): number | string {
  return v == null || !isFinite(v) ? "—" : Math.round(v * 10) / 10;
}
