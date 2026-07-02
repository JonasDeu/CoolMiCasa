import type { Doc, Hour, Room, ThermalMass, Weather } from "../types";
import { openingFactor, PX_PER_M, winHeight } from "./geometry";
import { roomTarget, sunOnWindow, ventilate } from "./recommend";
import type { RoomTempMap } from "./temps";

/** One projected hour for a single room. */
export interface ForecastPoint {
  /** Clock hour (0–23) of this step. */
  hour: number;
  iso: string;
  /** Projected indoor temperature, °C. */
  temp: number;
  /** Outdoor temperature that hour, °C. */
  outT: number;
  /** Were this room's windows modelled as open (worthwhile to ventilate)? */
  venting: boolean;
  /** Sun on this room's glass that hour. */
  sun: boolean;
}

export interface RoomForecast {
  roomId: string;
  /** True when the starting point is an estimate rather than a real reading. */
  estimated: boolean;
  /** Comfort target the curve is judged against, °C. */
  target: number;
  points: ForecastPoint[];
  /** Warmest projected hour. */
  peak: ForecastPoint;
  /** Coolest projected hour. */
  trough: ForecastPoint;
}

export type ForecastMap = Record<string, RoomForecast>;

/** A typical window's glazing area, m² — the reference the solar term is scaled against. */
const REF_AREA = 1.5;
/** Peak solar warming rate through a reference unshaded window, °C/hour. */
const SOLAR_K = 0.9;
/** Cap on total solar warming per hour, °C, so a wall of glass can't run away. */
const SOLAR_CAP = 2.4;

/**
 * Per-hour fraction of the indoor↔outdoor gap closed by envelope leakage alone
 * (windows shut). Light fabric tracks the outside quickly; heavy masonry lags.
 */
const LEAK: Record<ThermalMass, number> = { light: 0.22, medium: 0.13, heavy: 0.07 };
/**
 * Extra fraction closed when the windows are open and ventilating. Added on top of
 * LEAK, so the combined pull stays below 1 (no overshoot past the outdoor air).
 */
const VENT: Record<ThermalMass, number> = { light: 0.5, medium: 0.4, heavy: 0.28 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Solar warming rate for a room this hour, °C/hour, weighted by area/sun/shade/radiation. */
function solarRate(doc: Doc, room: Room, h: Hour): number {
  let rate = 0;
  for (const w of doc.windows) {
    if (w.roomId !== room.id) continue;
    if (!(sunOnWindow(w, h.sun, doc.northDeg) && h.rad > 120)) continue;
    const areaM2 = (w.len / PX_PER_M) * winHeight(w);
    const areaFactor = clamp(areaM2 / REF_AREA, 0.35, 2.2);
    const shadeFactor = w.shade ? 0.35 : 1;
    const radFactor = clamp(h.rad / 600, 0.35, 1.4);
    rate += SOLAR_K * areaFactor * radFactor * shadeFactor;
  }
  return Math.min(rate, SOLAR_CAP);
}

/** Does any of this room's glass catch direct sun this hour? */
function anySun(doc: Doc, room: Room, h: Hour): boolean {
  return doc.windows.some(
    (w) => w.roomId === room.id && sunOnWindow(w, h.sun, doc.northDeg) && h.rad > 120,
  );
}

/**
 * The room's best ventilation "openness" this hour, 0..1: 1 if it has a window that
 * opens fully, ~0.2 if its only windows are tilt-only, 0 if it has no windows.
 */
function ventOpenness(doc: Doc, roomId: string): number {
  let best = 0;
  for (const w of doc.windows) if (w.roomId === roomId) best = Math.max(best, openingFactor(w));
  return best;
}

/** Coolest outdoor air a room can reach: the lowest of its windows' overrides, else the area forecast. */
function roomOutdoor(doc: Doc, roomId: string, h: Hour): number {
  let best: number | null = null;
  for (const w of doc.windows) {
    if (w.roomId !== roomId || w.temp == null) continue;
    const t = +w.temp;
    if (best == null || t < best) best = t;
  }
  return best ?? h.temp;
}

/**
 * March each room's temperature forward over the next ~24 h with a lumped RC model:
 * every hour the room drifts toward the outdoor air (slowly through the envelope,
 * faster when its windows would be worth opening) and is nudged up by solar gain.
 * Thermal mass sets the time constants, so heavy masonry both warms and flushes
 * more sluggishly than a lightweight prefab. Tilt-only windows ventilate far less.
 */
export function forecastRoomTemps(
  doc: Doc,
  weather: Weather | null,
  temps: RoomTempMap,
): ForecastMap {
  const out: ForecastMap = {};
  if (!weather || doc.rooms.length === 0) return out;

  const start = weather.nowIdx;
  const N = Math.min(24, weather.hours.length - start);
  if (N <= 0) return out;
  const slice = weather.hours.slice(start, start + N);

  const leak = LEAK[doc.mass] ?? LEAK.medium;
  const ventK = VENT[doc.mass] ?? VENT.medium;

  for (const room of doc.rooms) {
    const target = roomTarget(doc, room);
    const openness = ventOpenness(doc, room.id);
    let t = temps[room.id]?.value ?? +room.temp;
    const points: ForecastPoint[] = [];
    let peak = -Infinity,
      trough = Infinity,
      peakI = 0,
      troughI = 0;

    for (let i = 0; i < slice.length; i++) {
      const h = slice[i];
      const outT = roomOutdoor(doc, room.id, h);
      // Decision the occupant would make this hour: open only when it actually helps.
      const beneficial = openness > 0 && ventilate(outT, t, target);
      const pull = leak + (beneficial ? ventK * openness : 0);
      t = t + pull * (outT - t) + solarRate(doc, room, h);
      t = round1(t);
      const p: ForecastPoint = {
        hour: h.hour,
        iso: h.iso,
        temp: t,
        outT: h.temp,
        venting: beneficial,
        sun: anySun(doc, room, h),
      };
      points.push(p);
      if (t > peak) {
        peak = t;
        peakI = i;
      }
      if (t < trough) {
        trough = t;
        troughI = i;
      }
    }

    out[room.id] = {
      roomId: room.id,
      estimated: !!temps[room.id]?.estimated,
      target,
      points,
      peak: points[peakI],
      trough: points[troughI],
    };
  }
  return out;
}
