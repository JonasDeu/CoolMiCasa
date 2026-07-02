import type { FanKind, FanSpot } from "../../lib/fanPlan";
import { useStore } from "../../store/useStore";
import { useDerived } from "../../state/derived";
import { roomById } from "../../lib/geometry";
import { maxIndoor, nowHour } from "../../lib/recommend";

const KIND_CHIP: Record<FanKind, string> = {
  exhaust: "BLOW OUT",
  intake: "BLOW IN",
  boost: "DOORWAY",
  personal: "AT YOU",
};

export function FanPlanPanel() {
  const { air, plan, docEff: doc } = useDerived();
  const weather = useStore((s) => s.weather);

  if (!weather) return <p className="muted">Set a location to model airflow and fan placement.</p>;
  if (doc.rooms.length === 0) return <p className="muted">Draw rooms and connect them with the Door tool.</p>;

  const owned = doc.fanCount || 0;
  const names = (set: Set<string>) =>
    [...set]
      .map((id) => roomById(doc.rooms, id)?.name)
      .filter(Boolean)
      .join(", ");

  const prio = doc.rooms.filter((r) => r.priority);
  const prioUnserved = prio.filter((r) => air.stagnant.has(r.id) || air.singleRooms.has(r.id));
  const h = nowHour(weather);
  const dT = h ? Math.max(0, (maxIndoor(doc.rooms) || 0) - h.temp) : 0;
  const st = plan.stack;

  return (
    <>
      <div className="fanplan-head">
        <span className={`pill ${plan.mode === "flush" ? "pill--open" : "pill--closed"}`}>
          {plan.mode === "flush" ? "FLUSH" : "SEALED"}
        </span>
        {plan.mode === "flush" && <FlowMeter q={air.Q} />}
        {plan.until && <span className="chip">⏱ {plan.until}</span>}
      </div>
      <p className="hint">{plan.headline}</p>

      {plan.mode === "flush" && (
        <div className="airflow-summary">
          {air.paths.length === 0 && (
            <div>
              🌬 Windows are open but there's no through-path — you need open windows on two <i>different</i> sides
              linked by open doors.
            </div>
          )}
          {prioUnserved.length > 0 && (
            <div className="caveat">
              ⭐ Off the breeze: <b>{prioUnserved.map((r) => r.name).join(", ")}</b> — the doorway fans below fix that
              first.
            </div>
          )}
          {air.doorSuggest.slice(0, 2).map((s, i) => (
            <div className="accent" key={i}>
              🚪 {s.priority ? "⭐ " : ""}Open the door <b>{s.aName}</b> ↔ <b>{s.bName}</b> to connect the breeze.
            </div>
          ))}
          {air.stagnant.size > 0 && <div className="muted">⚠ No fresh air: {names(air.stagnant)}.</div>}
          {air.singleRooms.size > 0 && <div className="muted">~ One-sided only: {names(air.singleRooms)}.</div>}
          {st && st.dH != null && st.dH > 0.2 && (
            <div className="muted">
              🌡 Chimney pull: intake {st.inSill!.toFixed(1)} m → exhaust {st.exTop!.toFixed(1)} m (Δh{" "}
              {st.dH.toFixed(1)} m · ΔT {dT.toFixed(1)}°) — height gap plus inside-vs-out gap drive the free draft.
            </div>
          )}
        </div>
      )}

      {plan.spots.length === 0 ? (
        <p className="muted">
          {plan.mode === "flush"
            ? "No fan needed — the natural breeze already covers every room."
            : "No room is over target — no fan needed right now."}
        </p>
      ) : owned === 0 ? (
        <p className="muted">Set how many fans you own (Setup) and the spots below get ranked for you.</p>
      ) : null}
      {plan.spots.map((f, i) => (
        <FanCard key={i} n={i + 1} f={f} use={i < owned} />
      ))}
      {owned > 0 && plan.spots.length > 0 && plan.spots.length < owned && (
        <p className="hint">
          Only {plan.spots.length} spot{plan.spots.length > 1 ? "s" : ""} earn a fan right now — spares won't add
          much.
        </p>
      )}

      <details className="howwork">
        <summary>How to place a fan well</summary>
        <ul>
          <li>
            A fan blows a tight jet but sucks diffusely — at doorways stand it <b>~½ m back</b> on the upstream side
            and shoot the jet through; never jam it into the gap.
          </li>
          <li>
            Window fans work best <b>sealed into the opening</b> (box fan) — otherwise stand them right at the window
            and stuff a towel into the side gaps so air can't loop straight back.
          </li>
          <li>
            Cool air is dense and hugs the floor; hot air pools at the ceiling — so bring air <b>in low</b> on the cool
            side and push it <b>out high</b> on the warm side.
          </li>
        </ul>
      </details>
    </>
  );
}

function FlowMeter({ q }: { q: number }) {
  const label = q >= 0.55 ? "strong" : q >= 0.25 ? "moderate" : q > 0.06 ? "gentle" : "still";
  const lit = Math.max(q > 0.06 ? 1 : 0, Math.round(q * 5));
  return (
    <span className="flowmeter" title={`Natural airflow right now: ${label}`}>
      {Array.from({ length: 5 }, (_, i) => (
        <i key={i} className={i < lit ? "on" : ""} />
      ))}
      <span className="tag">{label} flow</span>
    </span>
  );
}

function FanCard({ n, f, use }: { n: number; f: FanSpot; use: boolean }) {
  return (
    <div className={"rec fan-card" + (use ? "" : " fan-card--extra")}>
      <div className="rec__ttl">
        <span>
          {use ? `Fan ${n}` : "＋ extra"} · {f.label}
        </span>
        <span className="benefit" title={`Usefulness right now: ${Math.round(f.benefit * 100)}%`}>
          <i style={{ width: `${Math.max(8, Math.round(f.benefit * 100))}%` }} />
        </span>
      </div>
      <div className="fanmeta">
        <span className="chip chip--kind">{KIND_CHIP[f.kind]}</span>
        <span className="chip">↕ {f.heightM.toFixed(1)} m</span>
        <span className="muted">{f.place}</span>
      </div>
      <div className="muted">{f.why}</div>
    </div>
  );
}
