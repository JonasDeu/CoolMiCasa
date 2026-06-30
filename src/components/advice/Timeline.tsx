import { useStore } from "../../store/useStore";
import { compassName, windowFacing } from "../../lib/geometry";
import { classifyHour, fmt, maxIndoor, sunOnWindow } from "../../lib/recommend";
import type { Hour } from "../../types";

export function Timeline() {
  const doc = useStore((s) => s.doc);
  const weather = useStore((s) => s.weather);

  if (!weather || doc.rooms.length === 0)
    return <p className="muted">Add rooms + location for an hourly plan.</p>;

  const indoorT = maxIndoor(doc.rooms);
  const comfort = +doc.comfort;
  const start = weather.nowIdx;
  const N = Math.min(24, weather.hours.length - start);
  const slice = weather.hours.slice(start, start + N);
  const temps = slice.map((h) => h.temp);
  const tmin = Math.min(...temps),
    tmax = Math.max(...temps);

  const cls = (h: Hour) => classifyHour(h, indoorT, comfort, doc.windows, doc.northDeg);

  let firstVent: Hour | null = null;
  slice.forEach((h) => {
    if (cls(h).vent && firstVent == null) firstVent = h;
  });

  // summary callouts
  const parts: string[] = [];
  const nowVent = cls(slice[0]).vent;
  if (nowVent) {
    let end: Hour | null = null;
    for (let i = 0; i < slice.length; i++) {
      if (!cls(slice[i]).vent) {
        end = slice[i];
        break;
      }
    }
    parts.push(
      `✅ <b>Ventilate now.</b>${end ? ` Window of opportunity until about <b>${end.hour}:00</b> (then it stops helping).` : ""}`,
    );
  } else if (firstVent) {
    const fv = firstVent as Hour;
    parts.push(`⏳ Next good time to open up: <b>${fv.hour}:00</b> (drops to ${fmt(fv.temp)}° outside).`);
  } else {
    parts.push(
      `🟠 Outside stays warmer than your rooms for the next ${N}h — keep it sealed and shaded; rely on fans.`,
    );
  }
  let coolH = slice[0];
  for (const h of slice) if (h.temp < coolH.temp) coolH = h;
  parts.push(`🌙 Coolest hour ahead: <b>${coolH.hour}:00</b> at ${fmt(coolH.temp)}° — best moment to flush heat.`);
  const sunWins = new Set<string>();
  slice.forEach((h) => {
    if (h.rad > 120)
      doc.windows.forEach((w) => {
        if (sunOnWindow(w, h.sun, doc.northDeg)) sunWins.add(compassName(windowFacing(w, doc.northDeg)));
      });
  });
  if (sunWins.size) parts.push(`☀️ Sun will hit your <b>${[...sunWins].join(", ")}</b> window(s) — shade them before it arrives.`);

  return (
    <>
      <div className="timeline">
        {slice.map((h, i) => {
          const c = cls(h);
          const frac = tmax > tmin ? (h.temp - tmin) / (tmax - tmin) : 0.5;
          const bh = 18 + frac * 46;
          return (
            <div
              className="tcol"
              key={i}
              title={`${h.hour}:00 — ${fmt(h.temp)}° outside · ${c.vent ? "ventilate" : "seal"}${c.anySun ? " · sun on glass" : ""}`}
            >
              <div
                className="tcol__bar"
                style={{
                  height: bh,
                  background: c.vent ? "var(--good)" : "var(--warn)",
                  boxShadow: c.anySun ? "inset 0 3px 0 var(--sun)" : undefined,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="tlabels">
        {slice.map((h, i) => (
          <span key={i}>{i % 3 === 0 ? h.hour : ""}</span>
        ))}
      </div>
      <div className="timeline-summary">
        {parts.map((p, i) => (
          <div key={i} dangerouslySetInnerHTML={{ __html: p }} />
        ))}
      </div>
      <div className="legend">
        <span>
          <span className="swatch" style={{ background: "var(--good)" }} />
          Ventilate
        </span>
        <span>
          <span className="swatch" style={{ background: "var(--warn)" }} />
          Seal up
        </span>
        <span>
          <span className="swatch" style={{ background: "var(--sun)" }} />
          Sun on glass
        </span>
      </div>
    </>
  );
}
