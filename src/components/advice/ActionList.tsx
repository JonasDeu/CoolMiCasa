import { useStore } from "../../store/useStore";
import { useDerived } from "../../state/derived";
import { compassName, windowFacing } from "../../lib/geometry";
import {
  flatIndoorRh,
  flatIndoorTemp,
  fmt,
  hasCrossVentilation,
  nowHour,
  planVent,
  roomMuggyNote,
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

  const h = nowHour(weather);
  const comfort = +doc.comfort;
  const outdoor = h ? h.temp : weather.current.temp;
  const outRh = h ? h.rh : weather.current.rh;
  const precip = h ? h.precip : weather.current.precip;
  const precipProb = h ? h.precipProb : null;
  const wd = weather.current.windDir,
    ws = weather.current.windSpd;

  const indoorFlat = flatIndoorTemp(doc);
  const flatPlan = planVent(outdoor, outRh, indoorFlat, flatIndoorRh(doc), comfort, precip, precipProb);
  const anyEst = doc.rooms.some((r) => temps[r.id]?.estimated);

  const wholeFlat = flatPlan.open ? (
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
      {flatPlan.caveat && <div className="caveat">{flatPlan.caveat}</div>}
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
      {flatPlan.caveat && <div className="caveat">{flatPlan.caveat}</div>}
    </div>
  );

  // No plan drawn yet — still give the whole-flat verdict from a quick indoor temp.
  if (doc.rooms.length === 0) {
    if (indoorFlat == null)
      return (
        <p className="muted">
          Draw at least one room and type its temperature — or set a quick indoor temp (top-left) for an instant verdict.
        </p>
      );
    return (
      <>
        {wholeFlat}
        <p className="muted">
          👉 Draw your rooms &amp; windows (Plan tab) for per-room open/close/shade advice and a fan plan.
        </p>
      </>
    );
  }

  return (
    <>
      {anyEst && (
        <div className="warnbox">
          Some rooms have no sensor and are <b>estimated</b> (shown with ~ and a range). Double-click a room on the map to
          enter a real reading for sharper advice.
        </div>
      )}

      {wholeFlat}

      {doc.rooms.map((r) => {
        const wins = doc.windows.filter((w) => w.roomId === r.id);
        const indoorT = +r.temp;
        const target = roomTarget(doc, r);
        const warm = indoorT >= target;
        const estT = temps[r.id];
        const est = estT?.estimated;
        const muggy = roomMuggyNote(indoorT, r.rh ?? null);
        return (
          <div className={`rec${est ? " rec--est" : ""}`} key={r.id}>
            <div className="rec__ttl">
              <span>{r.name}</span>
              <span className="muted">
                {est && "~"}
                {isFinite(indoorT) ? fmt(indoorT) + "°" : "—"}
                {est && estT?.lo != null && (
                  <span className="tag">
                    {" "}
                    ({fmt(estT.lo)}–{fmt(estT.hi)}° est)
                  </span>
                )}{" "}
                <span className="tag">/ {fmt(target)}° target</span> {warm ? "🔥" : "✅"}
              </span>
            </div>
            {muggy && <div className="caveat">{muggy}</div>}
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
                  const wp = planVent(outT, outRh, indoorT, r.rh ?? null, target, precip, precipProb);
                  const humid = wp.importsMoisture
                    ? " · 💧 cooler but humid"
                    : wp.muggyOutside
                      ? " · 💧 humid air"
                      : "";
                  return (
                    <li key={w.id}>
                      <Pill kind="open">OPEN</Pill> {facing} window
                      {role === "windward"
                        ? " (breeze blows in here — main intake)"
                        : role === "leeward"
                          ? " (good spot for a fan blowing out)"
                          : ""}
                      {humid}.
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
