import { useMemo } from "react";
import { useStore } from "../../store/useStore";
import { useDerived } from "../../state/derived";
import { compassName } from "../../lib/geometry";
import { fmt, maxIndoor, nowHour, ventilate } from "../../lib/recommend";

/**
 * The headline. A big, color-coded verdict — OPEN UP / SEAL IT / HOLD — with the
 * three numbers that justify it. This is the first thing the user should read.
 */
export function NowBanner() {
  const { docEff: doc } = useDerived();
  const weather = useStore((s) => s.weather);
  const status = useStore((s) => s.weatherStatus);

  const view = useMemo(() => {
    if (!doc.location) {
      return { mood: "idle" as const, head: "Set a location to begin", sub: "Search for your city (top-left) to fetch the outdoor temperature, sun and wind." };
    }
    if (status === "loading" && !weather) return { mood: "idle" as const, head: "Loading weather…", sub: "" };
    if (status === "error" || !weather) return { mood: "idle" as const, head: "Weather unavailable", sub: "The forecast lookup failed — check your connection and try again." };

    const h = nowHour(weather);
    const indoorMax = maxIndoor(doc.rooms);
    const outdoor = h ? h.temp : weather.current.temp;
    const comfort = +doc.comfort;
    const globalVent = ventilate(outdoor, indoorMax, comfort);
    const wd = weather.current.windDir,
      ws = weather.current.windSpd;

    const mood = globalVent ? ("open" as const) : outdoor > (indoorMax ?? outdoor) ? ("seal" as const) : ("hold" as const);
    const head =
      mood === "open"
        ? "Open up — it's cooler outside"
        : mood === "seal"
          ? "Seal the flat — it's hotter outside"
          : "Hold — little to gain by opening";
    const sub =
      mood === "open"
        ? "Throw the windows wide and open internal doors to flush the day's heat while you can."
        : mood === "seal"
          ? "Keep windows and blinds shut to hold the cool you banked overnight; use fans to move indoor air."
          : "Outside isn't clearly cooler than your rooms. Keep it shut and shaded; reopen when it drops.";

    const sun =
      h && h.sun && h.sun.altitude > 0
        ? `sun in the ${compassName(h.sun.azimuth)}, ${Math.round(h.sun.altitude)}° up`
        : "sun is down";

    return {
      mood,
      head,
      sub,
      kpis: [
        { v: `${fmt(outdoor)}°`, l: "Outdoor" },
        { v: indoorMax == null ? "—" : `${fmt(indoorMax)}°`, l: "Warmest room" },
        { v: `${comfort}°`, l: "Target" },
      ],
      meta: `💨 Wind ${Math.round(ws)} km/h from ${compassName(wd)} · ☀️ ${sun} · ${weather.tz}`,
    };
  }, [doc, weather, status]);

  return (
    <div className={`now-banner now-banner--${view.mood}`}>
      <div className="now-banner__main">
        <div className="now-banner__icon" aria-hidden>
          {view.mood === "open" ? "🟢" : view.mood === "seal" ? "🔴" : view.mood === "hold" ? "🟠" : "📍"}
        </div>
        <div>
          <div className="now-banner__head">{view.head}</div>
          <div className="now-banner__sub">{view.sub}</div>
          {view.meta && <div className="now-banner__meta">{view.meta}</div>}
        </div>
      </div>
      {view.kpis && (
        <div className="now-banner__kpis">
          {view.kpis.map((k) => (
            <div className="kpi" key={k.l}>
              <div className="kpi__v">{k.v}</div>
              <div className="kpi__l">{k.l}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
