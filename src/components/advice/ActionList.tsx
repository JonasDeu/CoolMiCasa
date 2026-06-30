import { useStore } from "../../store/useStore";
import { useDerived } from "../../state/derived";
import { compassName, windowFacing } from "../../lib/geometry";
import {
  fmt,
  hasCrossVentilation,
  maxIndoor,
  nowHour,
  roomTarget,
  sunOnWindow,
  ventilate,
  windRole,
} from "../../lib/recommend";
import { Pill } from "../ui";

export function ActionList() {
  const { docEff: doc, temps } = useDerived();
  const weather = useStore((s) => s.weather);

  if (!doc.location) return <p className="muted">Add a location (top-left) to fetch outdoor temperature.</p>;
  if (!weather) return <p className="muted">Loading weather…</p>;
  if (doc.rooms.length === 0) return <p className="muted">Draw at least one room and type its temperature.</p>;

  const h = nowHour(weather);
  const comfort = +doc.comfort;
  const indoorMax = maxIndoor(doc.rooms);
  const outdoor = h ? h.temp : weather.current.temp;
  const globalVent = ventilate(outdoor, indoorMax, comfort);
  const wd = weather.current.windDir,
    ws = weather.current.windSpd;
  const anyEst = doc.rooms.some((r) => temps[r.id]?.estimated);

  return (
    <>
      {anyEst && (
        <div className="warnbox">
          Some rooms have no sensor and are <b>estimated</b> (shown with ~). Double-click a room on the map to enter a real
          reading for sharper advice.
        </div>
      )}

      {globalVent ? (
        <div className="rec">
          <div className="rec__ttl">
            Whole flat <Pill kind="open">VENTILATE</Pill>
          </div>
          <ul>
            <li>
              Open windows wide and{" "}
              {hasCrossVentilation(doc.windows, doc.northDeg)
                ? "open the doors between rooms (incl. the hallway) for a cross-breeze"
                : "open internal doors to let air move through"}
              .
            </li>
            <li>Goal: flush the day's heat while outside ({fmt(outdoor)}°) is below your rooms.</li>
            <li>👉 See the fan plan below for exactly where to put fans and at what height.</li>
          </ul>
        </div>
      ) : (
        <div className="rec">
          <div className="rec__ttl">
            Whole flat <Pill kind="closed">KEEP CLOSED</Pill>
          </div>
          <ul>
            <li>Close windows on the warm/sunny sides to trap the cool you banked overnight.</li>
            <li>Use fans to move indoor air (a breeze feels ~3°C cooler) — don't draw in the hot outside air.</li>
            <li>Reopen when outside drops below your room temp (see the timeline).</li>
          </ul>
        </div>
      )}

      {doc.rooms.map((r) => {
        const wins = doc.windows.filter((w) => w.roomId === r.id);
        const indoorT = +r.temp;
        const target = roomTarget(doc, r);
        const warm = indoorT >= target;
        const est = temps[r.id]?.estimated;
        return (
          <div className="rec" key={r.id}>
            <div className="rec__ttl">
              <span>{r.name}</span>
              <span className="muted">
                {est && "~"}
                {isFinite(indoorT) ? fmt(indoorT) + "°" : "—"}
                {est && <span className="tag"> est</span>} <span className="tag">/ {fmt(target)}° target</span>{" "}
                {warm ? "🔥" : "✅"}
              </span>
            </div>
            <ul>
              {wins.length === 0 && <li className="tag">No windows drawn. Use the Window tool to add one.</li>}
              {wins.map((w) => {
                const outT = w.temp != null ? +w.temp : outdoor;
                const sunHit = !!h && sunOnWindow(w, h.sun, doc.northDeg) && h.rad > 120;
                const facing = compassName(windowFacing(w, doc.northDeg));
                if (sunHit) {
                  return (
                    <li key={w.id}>
                      <Pill kind="shade">SHADE</Pill> {facing} window — sun is on the glass.
                      {w.shade ? " Close the blind/curtain." : " ⚠️ No shade fitted; improvise (cardboard, towel, foil) outside the glass if you can."}
                    </li>
                  );
                }
                if (ventilate(outT, indoorT, target)) {
                  const role = windRole(windowFacing(w, doc.northDeg), wd, ws);
                  return (
                    <li key={w.id}>
                      <Pill kind="open">OPEN</Pill> {facing} window
                      {role === "windward"
                        ? " (breeze blows in here — main intake)"
                        : role === "leeward"
                          ? " (good spot for a fan blowing out)"
                          : ""}
                      .
                    </li>
                  );
                }
                return (
                  <li key={w.id}>
                    <Pill kind="closed">CLOSE</Pill> {facing} window — outside not cooler.
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}
