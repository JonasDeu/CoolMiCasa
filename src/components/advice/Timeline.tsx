import { useStore } from "../../store/useStore";
import { useDerived } from "../../state/derived";
import { classifyHour, fmt, flatIndoorTemp } from "../../lib/recommend";
import type { Hour } from "../../types";

/**
 * The hour-by-hour picture: bar height = outdoor temperature, colour = the
 * open/seal verdict for that hour. The narrative of when to act lives in the
 * "Coming up" schedule — this chart is the at-a-glance shape of the day.
 */
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
