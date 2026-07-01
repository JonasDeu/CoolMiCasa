import type { Doc, Hour, Room, SunPos, Weather, WindowItem } from "../types";
import { angDiff, compassName, roomById, windowFacing } from "./geometry";
import { dewPointC, DEW_MARGIN, MUGGY_DEW, muggyLevel } from "./humidity";

export function nowHour(weather: Weather | null): Hour | null {
  return weather ? weather.hours[weather.nowIdx] : null;
}

export function maxIndoor(rooms: Room[]): number | null {
  return rooms.length ? Math.max(...rooms.map((r) => +r.temp || 0)) : null;
}

/** A room's effective comfort target: its own override, else the document default. */
export function roomTarget(doc: Doc, room: Room): number {
  return room.target != null ? +room.target : +doc.comfort;
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

/** Rain is falling / imminent enough that you can't just throw the windows wide. */
export function isRaining(precipMm: number | null | undefined, precipProb: number | null | undefined): boolean {
  return (precipMm != null && precipMm >= 0.2) || (precipProb != null && precipProb >= 60);
}

/** Warmest-room / quick-start indoor temperature for whole-flat reasoning. */
export function flatIndoorTemp(doc: Doc): number | null {
  if (doc.rooms.length) return maxIndoor(doc.rooms);
  const q = doc.quickIndoorTemp;
  return q != null && Number.isFinite(+q) ? +q : null;
}

/** Average measured/effective indoor humidity across rooms that have a hygrometer, else null. */
export function flatIndoorRh(doc: Doc): number | null {
  const vals = doc.rooms
    .map((r) => r.rh)
    .filter((v): v is number => v != null && Number.isFinite(+v))
    .map((v) => +v);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export interface VentPlan {
  /** Final call: is opening worthwhile right now? */
  open: boolean;
  /** Dry-bulb gate on its own (before humidity/rain). */
  tempOpen: boolean;
  /** How much cooler it is outside, °C (indoor − outdoor; negative = hotter out). */
  tempGain: number;
  outDew: number | null;
  inDew: number | null;
  /** Opening would raise indoor moisture noticeably (needs an indoor hygrometer). */
  importsMoisture: boolean;
  /** Outdoor air is muggy in absolute terms. */
  muggyOutside: boolean;
  raining: boolean;
  /** One-line caveat to show beneath the verdict, or null when there's nothing to add. */
  caveat: string | null;
}

/**
 * Whether to ventilate, weighing temperature AND moisture AND rain — not dry-bulb alone.
 * Temperature still leads (importing some humidity to get real cooling is usually worth it),
 * but a barely-cooler, much-muggier swap is downgraded, and rain is always flagged.
 */
export function planVent(
  outT: number | null,
  outRh: number | null,
  inT: number | null,
  inRh: number | null,
  comfort: number,
  precipMm: number | null,
  precipProb: number | null,
): VentPlan {
  const tempOpen = ventilate(outT, inT, comfort);
  const tempGain = inT != null && outT != null ? inT - outT : 0;
  const outDew = outT != null && outRh != null ? dewPointC(outT, outRh) : null;
  const inDew = inT != null && inRh != null ? dewPointC(inT, inRh) : null;
  const importsMoisture = outDew != null && inDew != null && outDew > inDew + DEW_MARGIN;
  const muggyOutside = outDew != null && outDew >= MUGGY_DEW;
  const raining = isRaining(precipMm, precipProb);

  // A marginal temperature win that trades away a lot of dryness isn't worth it.
  const marginal = tempOpen && importsMoisture && tempGain < 2;
  const open = tempOpen && !marginal;

  let caveat: string | null = null;
  if (raining && open) {
    caveat = "🌧 Rain about — open only sheltered/leeward windows a crack so you don't let water in.";
  } else if (marginal) {
    caveat = "💧 Only a touch cooler but much more humid outside — not worth the mugginess; stay sealed.";
  } else if (open && importsMoisture) {
    caveat = "💧 Cooler but more humid outside — you'll import some stickiness; open for the biggest temperature drop, then close.";
  } else if (open && muggyOutside && inDew == null) {
    caveat = `💧 Outside air is humid (dew point ${Math.round(outDew as number)}°). Worth it for the temperature, but it'll feel sticky — a hygrometer would sharpen this call.`;
  } else if (open && inDew != null && outDew != null && outDew < inDew - DEW_MARGIN) {
    caveat = "💧 Bonus: outside is cooler AND drier right now — ideal, flush the flat.";
  } else if (raining) {
    caveat = "🌧 Rain about — a downpour is great free cooling; be ready to open right after it passes.";
  }

  return { open, tempOpen, tempGain, outDew, inDew, importsMoisture, muggyOutside, raining, caveat };
}

/** Text label for the moisture level of a room, when its humidity is known. */
export function roomMuggyNote(tempC: number | null, rh: number | null): string | null {
  if (tempC == null || rh == null) return null;
  const dew = dewPointC(tempC, rh);
  const lvl = muggyLevel(dew);
  if (lvl === "comfortable") return null;
  return lvl === "oppressive"
    ? `💧 Air feels oppressive (dew point ${Math.round(dew)}°) — a breeze will help, drying it needs cooler air or a dehumidifier.`
    : `💧 Air feels muggy (dew point ${Math.round(dew)}°).`;
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
  return doc.windows.filter((w) => {
    const r = roomById(doc.rooms, w.roomId);
    const indoorT = r ? +r.temp : maxIndoor(doc.rooms);
    const target = r ? roomTarget(doc, r) : +doc.comfort;
    const outT = w.temp != null ? +w.temp : h.temp;
    const sunHit = sunOnWindow(w, h.sun, doc.northDeg) && h.rad > 120;
    return !sunHit && ventilate(outT, indoorT, target);
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
