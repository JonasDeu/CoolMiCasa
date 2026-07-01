import type { Doc, Hour, ThermalMass, Weather } from "../types";
import { compassName, windowFacing } from "./geometry";
import { flatIndoorTemp, nowHour, sunOnWindow, ventilate } from "./recommend";

/** A contiguous stretch of hours where opening up would help. */
export interface VentRun {
  startHour: number;
  /** Hour it stops helping, or null if it runs to the end of the horizon. */
  endHour: number | null;
  length: number;
  minTemp: number;
}

export interface DayStrategy {
  indoorT: number;
  ventNow: boolean;
  /** The current (if venting now) or next upcoming ventilate window. */
  run: VentRun | null;
  /** Is that window long enough to actually shift this building's fabric? */
  longEnough: boolean;
  /** Hours of sustained cool this construction needs before it responds. */
  needHours: number;
  coolest: Hour;
  /** Compass sides the sun will hit over the horizon — shade these. */
  shadeSides: string[];
  /** Hours (24h clock) in the horizon with rain. */
  rainHours: number[];
}

/** How many hours of cool air a construction needs before its mass starts to cool. */
const MASS_HOURS: Record<ThermalMass, number> = { light: 1, medium: 3, heavy: 5 };

/** Human label for the fabric, used in the synthesized advice. */
export const MASS_LABEL: Record<ThermalMass, string> = {
  light: "lightweight",
  medium: "average",
  heavy: "heavy masonry",
};

/**
 * Turn the hourly forecast into ONE coherent plan rather than 24 independent verdicts:
 * when to open, whether that window is long enough for the building's thermal mass to
 * respond, what to shade, and when rain brings free cooling.
 */
export function buildStrategy(doc: Doc, weather: Weather | null): DayStrategy | null {
  const h0 = nowHour(weather);
  const indoorT = flatIndoorTemp(doc);
  if (!weather || !h0 || indoorT == null) return null;

  const comfort = +doc.comfort;
  const start = weather.nowIdx;
  const N = Math.min(24, weather.hours.length - start);
  const slice = weather.hours.slice(start, start + N);
  const vent = slice.map((h) => ventilate(h.temp, indoorT, comfort));

  // First run of ventilate hours at/after now.
  let run: VentRun | null = null;
  let i = 0;
  while (i < slice.length && !vent[i]) i++;
  if (i < slice.length) {
    let j = i,
      minT = Infinity;
    while (j < slice.length && vent[j]) {
      minT = Math.min(minT, slice[j].temp);
      j++;
    }
    run = { startHour: slice[i].hour, endHour: j < slice.length ? slice[j].hour : null, length: j - i, minTemp: minT };
  }

  const needHours = MASS_HOURS[doc.mass] ?? 3;
  const longEnough = run != null && run.length >= needHours;

  let coolest = slice[0];
  for (const h of slice) if (h.temp < coolest.temp) coolest = h;

  const shadeSides: string[] = [];
  const seen = new Set<string>();
  for (const h of slice) {
    if (h.rad <= 120) continue;
    for (const w of doc.windows) {
      if (!sunOnWindow(w, h.sun, doc.northDeg)) continue;
      const name = compassName(windowFacing(w, doc.northDeg));
      if (!seen.has(name)) {
        seen.add(name);
        shadeSides.push(name);
      }
    }
  }

  const rainHours = slice.filter((h) => h.precip >= 0.2 || h.precipProb >= 60).map((h) => h.hour);

  return { indoorT, ventNow: vent[0], run, longEnough, needHours, coolest, shadeSides, rainHours };
}
