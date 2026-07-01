/**
 * Moisture comfort. Passive cooling isn't only about dry-bulb temperature: on a
 * muggy night, air that is a degree "cooler" can still feel worse and cools your
 * thermal mass less, because you're importing water vapour. Dew point is the
 * honest yardstick — it tracks absolute moisture regardless of temperature.
 */

/** Dew point (°C) from dry-bulb temp (°C) and relative humidity (%), Magnus formula. */
export function dewPointC(tempC: number, rh: number): number {
  const b = 17.62,
    c = 243.12;
  const r = Math.max(1, Math.min(100, rh));
  const g = Math.log(r / 100) + (b * tempC) / (c + tempC);
  return (c * g) / (b - g);
}

/** Dew point at/above which indoor air starts to feel sticky. */
export const MUGGY_DEW = 16;
/** Dew point at/above which it feels oppressive. */
export const OPPRESSIVE_DEW = 19;
/** Two windows' dew points closer than this (°C) count as "the same" moisture-wise. */
export const DEW_MARGIN = 1.5;

export type MuggyLevel = "comfortable" | "muggy" | "oppressive";

export function muggyLevel(dew: number): MuggyLevel {
  if (dew >= OPPRESSIVE_DEW) return "oppressive";
  if (dew >= MUGGY_DEW) return "muggy";
  return "comfortable";
}
