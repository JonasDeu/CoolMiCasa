import { useStore } from "../../store/useStore";
import { useDerived } from "../../state/derived";
import { classifyHour, fmt, flatIndoorTemp } from "../../lib/recommend";
import { buildStrategy, MASS_LABEL } from "../../lib/strategy";
import type { Hour } from "../../types";

export function Timeline() {
  const { docEff: doc } = useDerived();
  const weather = useStore((s) => s.weather);

  if (!weather) return <p className="muted">Add a location for an hourly plan.</p>;
  const indoorT = flatIndoorTemp(doc);
  if (indoorT == null)
    return <p className="muted">Add a room temperature (or a quick indoor temp up top) for an hourly plan.</p>;

  const comfort = +doc.comfort;
  const start = weather.nowIdx;
  const N = Math.min(24, weather.hours.length - start);
  const slice = weather.hours.slice(start, start + N);
  const temps = slice.map((h) => h.temp);
  const tmin = Math.min(...temps),
    tmax = Math.max(...temps);

  const cls = (h: Hour) => classifyHour(h, indoorT, comfort, doc.windows, doc.northDeg);
  const isWet = (h: Hour) => h.precip >= 0.2 || h.precipProb >= 60;
  const strat = buildStrategy(doc, weather);

  // ---- synthesized plan (one coherent story, not 24 verdicts) ----
  const parts: string[] = [];
  if (strat) {
    const mass = MASS_LABEL[doc.mass];
    const massTail = strat.run
      ? strat.longEnough
        ? ` — <b>${strat.run.length}h</b>, long enough to flush ${mass} walls.`
        : ` — but only <b>${strat.run.length}h</b>; with ${mass} fabric that barely shifts the walls, so lean on shade & fans too.`
      : "";
    if (strat.ventNow && strat.run) {
      parts.push(
        `✅ <b>Ventilate now.</b> Open until about <b>${strat.run.endHour ?? "dawn"}${
          strat.run.endHour != null ? ":00" : ""
        }</b>${massTail}`,
      );
    } else if (strat.run) {
      parts.push(
        `⏳ <b>Seal & shade now.</b> Next worthwhile opening ~<b>${strat.run.startHour}:00${
          strat.run.endHour != null ? `–${strat.run.endHour}:00` : ""
        }</b> (down to ${fmt(strat.run.minTemp)}° outside)${massTail}`,
      );
    } else {
      parts.push(`🟠 Outside stays warmer than your rooms for the next ${N}h — keep it sealed and shaded; rely on fans.`);
    }
    parts.push(`🌙 Coolest hour ahead: <b>${strat.coolest.hour}:00</b> at ${fmt(strat.coolest.temp)}° — the moment to flush heat.`);
    if (strat.rainHours.length) {
      const hrs = strat.rainHours.slice(0, 3).map((h) => `${h}:00`).join(", ");
      parts.push(`🌧 Rain likely around <b>${hrs}</b> — a downpour is the best free cooling of the day; open right after it passes.`);
    }
    if (strat.shadeSides.length) {
      parts.push(`☀️ Sun will hit your <b>${strat.shadeSides.join(", ")}</b> window(s) — shade them before it arrives.`);
    }
  }

  return (
    <>
      <div className="timeline">
        {slice.map((h, i) => {
          const c = cls(h);
          const wet = isWet(h);
          const frac = tmax > tmin ? (h.temp - tmin) / (tmax - tmin) : 0.5;
          const bh = 18 + frac * 46;
          const shadows: string[] = [];
          if (c.anySun) shadows.push("inset 0 3px 0 var(--sun)");
          if (wet) shadows.push("inset 0 -4px 0 var(--accent)");
          return (
            <div
              className="tcol"
              key={i}
              title={`${h.hour}:00 — ${fmt(h.temp)}° outside · ${c.vent ? "ventilate" : "seal"}${
                c.anySun ? " · sun on glass" : ""
              }${wet ? " · rain" : ""}`}
            >
              <div
                className="tcol__bar"
                style={{
                  height: bh,
                  background: c.vent ? "var(--good)" : "var(--warn)",
                  boxShadow: shadows.length ? shadows.join(", ") : undefined,
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
        <span>
          <span className="swatch" style={{ background: "var(--accent)" }} />
          Rain
        </span>
      </div>
    </>
  );
}
