import type { Hour, LatLon, Weather } from "../types";
import { sunPosition } from "./solar";

/** Free, key-less weather via Open-Meteo. */

export async function geocode(q: string): Promise<LatLon[]> {
  const r = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`,
  );
  const j = await r.json();
  return (j.results || []).map((x: any) => ({
    name: [x.name, x.admin1, x.country_code].filter(Boolean).join(", "),
    lat: x.latitude,
    lon: x.longitude,
  }));
}

export async function fetchWeather(loc: LatLon): Promise<Weather> {
  const { lat, lon } = loc;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,relative_humidity_2m,shortwave_radiation,wind_speed_10m,wind_direction_10m` +
    `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,is_day` +
    `&timezone=auto&forecast_days=2`;
  const r = await fetch(url);
  const j = await r.json();
  const offset: number = j.utc_offset_seconds || 0;
  const H = j.hourly;
  const hours: Hour[] = [];
  for (let i = 0; i < H.time.length; i++) {
    const iso: string = H.time[i];
    const realDate = new Date(Date.parse(iso + "Z") - offset * 1000); // true UTC instant
    hours.push({
      iso,
      hour: parseInt(iso.slice(11, 13), 10),
      date: realDate,
      temp: H.temperature_2m[i],
      rh: H.relative_humidity_2m[i],
      rad: H.shortwave_radiation[i],
      windSpd: H.wind_speed_10m[i],
      windDir: H.wind_direction_10m[i],
      sun: sunPosition(realDate, lat, lon),
    });
  }
  const cIso: string = j.current.time;
  let nowIdx = hours.findIndex((h) => h.iso.slice(0, 13) === cIso.slice(0, 13));
  if (nowIdx < 0) nowIdx = 0;
  return {
    tz: j.timezone,
    offset,
    hours,
    nowIdx,
    current: {
      temp: j.current.temperature_2m,
      rh: j.current.relative_humidity_2m,
      windSpd: j.current.wind_speed_10m,
      windDir: j.current.wind_direction_10m,
      isDay: j.current.is_day,
      sun: hours[nowIdx] ? hours[nowIdx].sun : null,
    },
  };
}
