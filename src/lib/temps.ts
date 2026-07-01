import type { Doc, Room, Weather } from "../types";
import { angDiff, PX_PER_M, windowFacing, winHeight } from "./geometry";
import { nowHour, sunOnWindow } from "./recommend";

export interface RoomTemp {
  /** Effective temperature to use everywhere in the logic, °C. */
  value: number;
  /** True when this is a model estimate rather than a real reading. */
  estimated: boolean;
  /** Plausible low/high bound of an estimate, °C (only set when `estimated`). */
  lo?: number;
  hi?: number;
  /** Effective relative humidity, %, or null when nothing is known. */
  rh: number | null;
  /** True when `rh` was borrowed from other rooms rather than a hygrometer here. */
  rhEstimated: boolean;
}

export type RoomTempMap = Record<string, RoomTemp>;

/** A typical window's glazing area, m² — the reference the solar bump is scaled against. */
const REF_AREA = 1.5;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

function isMeasured(r: Room): boolean {
  return r.measured !== false && Number.isFinite(+r.temp);
}
function hasRh(r: Room): boolean {
  return r.rh != null && Number.isFinite(+r.rh);
}

/**
 * Effective indoor temperature (and humidity) for every room.
 *
 * Rooms with a real reading are passed through. Rooms without a sensor are
 * estimated from the measured rooms (or the outdoor air as a fallback) and
 * nudged up for solar gain. The solar bump is now weighted by each window's
 * glass area, the live radiation, and whether a blind is fitted — a big
 * unshaded west patio door banks far more heat than a shaded bathroom vent.
 * Estimates also carry a plausible ± range so the UI can show their softness.
 */
export function computeRoomTemps(doc: Doc, weather: Weather | null): RoomTempMap {
  const h = nowHour(weather);
  const out: RoomTempMap = {};

  const measured = doc.rooms.filter(isMeasured);
  const avgMeasured = measured.length
    ? measured.reduce((a, r) => a + +r.temp, 0) / measured.length
    : null;

  const withRh = doc.rooms.filter(hasRh);
  const avgRh = withRh.length ? withRh.reduce((a, r) => a + +r.rh!, 0) / withRh.length : null;

  for (const r of doc.rooms) {
    // ---- humidity (independent of whether the temp is measured) ----
    let rh: number | null;
    let rhEstimated: boolean;
    if (hasRh(r)) {
      rh = +r.rh!;
      rhEstimated = false;
    } else if (avgRh != null) {
      rh = Math.round(avgRh);
      rhEstimated = true;
    } else {
      rh = null;
      rhEstimated = false;
    }

    // ---- temperature ----
    if (isMeasured(r)) {
      out[r.id] = { value: +r.temp, estimated: false, rh, rhEstimated };
      continue;
    }

    // Baseline: the measured rooms, else a bit above the current outdoor air.
    let base: number;
    if (avgMeasured != null) base = avgMeasured;
    else if (h) base = h.temp + 2;
    else base = +doc.comfort;

    // Solar bump from this room's own windows, weighted by area / sun / shade.
    let bump = 0;
    for (const w of doc.windows) {
      if (w.roomId !== r.id) continue;
      const facing = windowFacing(w, doc.northDeg);
      const areaM2 = (w.len / PX_PER_M) * winHeight(w);
      const areaFactor = clamp(areaM2 / REF_AREA, 0.35, 2.2);
      // A fitted blind is assumed deployed against direct sun, so it cuts the gain.
      const shadeFactor = w.shade ? 0.35 : 1;
      if (h && sunOnWindow(w, h.sun, doc.northDeg) && h.rad > 120) {
        const radFactor = clamp(h.rad / 600, 0.35, 1.4); // weak sun bumps less than blazing noon
        bump += 1.4 * areaFactor * radFactor * shadeFactor;
      } else {
        // standing bias: south/west glass banks daytime heat even when not lit right now
        const south = 180,
          west = 270;
        if (angDiff(facing, south) < 50 || angDiff(facing, west) < 50) bump += 0.4 * areaFactor * shadeFactor;
      }
    }
    bump = Math.min(bump, 4); // a windowless interior room barely gains; clamp the bump

    const value = round1(base + bump);
    // Wider uncertainty when we're guessing off the outdoor air, and the more solar we're inferring.
    const unc = round1((avgMeasured != null ? 1.4 : 3) + 0.35 * bump);
    out[r.id] = { value, estimated: true, lo: round1(value - unc), hi: round1(value + unc), rh, rhEstimated };
  }
  return out;
}

/** Build a copy of the document whose room temps (and humidity) are the effective values. */
export function withEffectiveTemps(doc: Doc, temps: RoomTempMap): Doc {
  return {
    ...doc,
    rooms: doc.rooms.map((r) => ({
      ...r,
      temp: temps[r.id]?.value ?? r.temp,
      rh: temps[r.id]?.rh ?? r.rh ?? null,
    })),
  };
}

/**
 * What the model WOULD estimate for a room if it had no sensor — computed by
 * ignoring this room's own reading. Lets the UI show measured-vs-modelled so the
 * user can calibrate how far to trust the estimates elsewhere.
 */
export function estimateAsUnmeasured(doc: Doc, roomId: string, weather: Weather | null): number | null {
  const clone: Doc = {
    ...doc,
    rooms: doc.rooms.map((r) => (r.id === roomId ? { ...r, measured: false } : r)),
  };
  return computeRoomTemps(clone, weather)[roomId]?.value ?? null;
}
