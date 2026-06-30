import type { SunPos } from "../types";

/**
 * Solar position (SunCalc-style). Returns the sun's compass azimuth measured
 * clockwise from North and its altitude above the horizon, both in degrees.
 */
export function sunPosition(date: Date, lat: number, lon: number): SunPos {
  const rad = Math.PI / 180;
  const dayMs = 864e5;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const toDays = (d: Date) => d.valueOf() / dayMs - 0.5 + J1970 - J2000;
  const e = rad * 23.4397;
  const d = toDays(date);
  const M = rad * (357.5291 + 0.98560028 * d);
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + rad * 102.9372 + Math.PI;
  const dec = Math.asin(Math.sin(0) * Math.cos(e) + Math.cos(0) * Math.sin(e) * Math.sin(L));
  const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
  const lw = rad * -lon;
  const phi = rad * lat;
  const theta = rad * (280.16 + 360.9856235 * d) - lw;
  const H = theta - ra;
  const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  // azimuth measured from south, converted to a 0..360 compass bearing from north
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  return {
    azimuth: (((az / rad + 180) % 360) + 360) % 360,
    altitude: alt / rad,
  };
}
