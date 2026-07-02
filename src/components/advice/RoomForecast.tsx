import { useStore } from "../../store/useStore";
import { useDerived } from "../../state/derived";
import { fmt } from "../../lib/recommend";
import type { ForecastPoint, RoomForecast } from "../../lib/forecast";
import type { Room } from "../../types";

const W = 220;
const H = 40;

/**
 * Per-room temperature outlook for the next ~24 h. Each room gets a sparkline of its
 * projected indoor temperature (the derived RC model), coloured warm/cool against its
 * target, with the peak and coolest hours called out. This is the visible payoff of
 * the forecast pipeline — when the flat will actually be hot, room by room.
 */
export function RoomForecast() {
  const { docEff: doc, forecast } = useDerived();
  const weather = useStore((s) => s.weather);

  if (!weather) return <p className="muted">Add a location for a room-by-room temperature outlook.</p>;
  const rooms = doc.rooms.filter((r) => forecast[r.id]?.points.length);
  if (rooms.length === 0)
    return <p className="muted">Draw at least one room to project how warm it gets over the day.</p>;

  // Shared vertical scale across every room + their targets, so the rows are comparable.
  let lo = Infinity,
    hi = -Infinity;
  for (const r of rooms) {
    const f = forecast[r.id];
    for (const p of f.points) {
      lo = Math.min(lo, p.temp);
      hi = Math.max(hi, p.temp);
    }
    lo = Math.min(lo, f.target);
    hi = Math.max(hi, f.target);
  }
  if (hi - lo < 2) {
    const m = (hi + lo) / 2;
    lo = m - 1;
    hi = m + 1;
  }

  const hottest = rooms
    .map((r) => forecast[r.id])
    .sort((a, b) => b.peak.temp - a.peak.temp)[0];

  return (
    <>
      <p className="hint">
        Projected indoor temperature, next 24 h — from your current readings, the forecast, sun on the glass and how the
        walls hold heat.
      </p>
      {hottest && (
        <div className="caveat">
          🔺 Hottest ahead: <b>{roomName(doc, hottest.roomId)}</b> ~<b>{fmt(hottest.peak.temp)}°</b> at{" "}
          <b>{hottest.peak.hour}:00</b>
          {hottest.peak.temp > hottest.target ? ` — ${fmt(hottest.peak.temp - hottest.target)}° over target.` : "."}
        </div>
      )}
      <div className="forecast-list">
        {rooms.map((r) => (
          <ForecastRow key={r.id} f={forecast[r.id]} room={r} lo={lo} hi={hi} />
        ))}
      </div>
      <div className="legend">
        <span>
          <span className="swatch" style={{ background: "var(--good)" }} />
          At/under target
        </span>
        <span>
          <span className="swatch" style={{ background: "var(--warn)" }} />
          Over target
        </span>
        <span>
          <span className="swatch" style={{ background: "var(--sun)" }} />
          Sun on glass
        </span>
        <span>· · · target</span>
      </div>
    </>
  );
}

function roomName(doc: ReturnType<typeof useDerived>["docEff"], id: string): string {
  return doc.rooms.find((r) => r.id === id)?.name ?? "room";
}

function ForecastRow({
  f,
  room,
  lo,
  hi,
}: {
  f: RoomForecast;
  room: Room;
  lo: number;
  hi: number;
}) {
  const name = room.name;
  const rh = room.rh != null && Number.isFinite(+room.rh) ? Math.round(+room.rh) : null;
  const n = f.points.length;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2);
  const y = (t: number) => H - 4 - ((t - lo) / (hi - lo)) * (H - 8);
  const targetY = y(f.target);

  const line = f.points.map((p, i) => `${x(i).toFixed(1)},${y(p.temp).toFixed(1)}`).join(" ");
  const area = `0,${H} ${line} ${W},${H}`;

  return (
    <div className="forecast-row">
      <div className="forecast-row__head">
        <span className="forecast-row__name">
          {f.estimated && "~"}
          {name}
        </span>
        <span className="forecast-row__now">
          {f.estimated && "~"}
          {fmt(+room.temp)}° now
          {rh != null && ` · 💧${rh}%`}
        </span>
        <span className="forecast-row__stats">
          <span className="warm">▲ {fmt(f.peak.temp)}° {f.peak.hour}h</span>
          {"  "}
          <span className="cool">▼ {fmt(f.trough.temp)}° {f.trough.hour}h</span>
        </span>
      </div>
      <svg className="forecast-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`${name} peaks ${fmt(f.peak.temp)} degrees at ${f.peak.hour}:00`}>
        <polygon points={area} fill="rgba(94,198,255,.08)" />
        {/* target reference */}
        <line x1={0} y1={targetY} x2={W} y2={targetY} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
        {/* the projected curve, coloured per-hour against the target */}
        {f.points.slice(1).map((p, i) => {
          const prev = f.points[i];
          const over = p.temp > f.target + 0.2;
          return (
            <line
              key={i}
              x1={x(i)}
              y1={y(prev.temp)}
              x2={x(i + 1)}
              y2={y(p.temp)}
              stroke={over ? "var(--warn)" : "var(--good)"}
              strokeWidth={2}
              strokeLinecap="round"
            />
          );
        })}
        {/* sun-on-glass ticks along the top */}
        {f.points.map((p, i) =>
          p.sun ? <circle key={i} cx={x(i)} cy={3} r={1.6} fill="var(--sun)" /> : null,
        )}
        {/* peak marker */}
        <PeakDot p={f.peak} points={f.points} x={x} y={y} />
      </svg>
    </div>
  );
}

function PeakDot({
  p,
  points,
  x,
  y,
}: {
  p: ForecastPoint;
  points: ForecastPoint[];
  x: (i: number) => number;
  y: (t: number) => number;
}) {
  const i = points.indexOf(p);
  if (i < 0) return null;
  return <circle cx={x(i)} cy={y(p.temp)} r={2.6} fill="var(--warn)" stroke="#0b1219" strokeWidth={1} />;
}
