import type { AirflowResult } from "../../lib/airflow";
import type { FanPlan } from "../../lib/fanPlan";
import { useStore } from "../../store/useStore";
import { useDerived } from "../../state/derived";
import { roomById, winArea } from "../../lib/geometry";
import { maxIndoor, nowHour } from "../../lib/recommend";

export function FanPlanPanel() {
  const { air, plan, docEff: doc } = useDerived();
  const weather = useStore((s) => s.weather);

  if (!weather) return <p className="muted">Set a location to model airflow and fan placement.</p>;
  if (doc.rooms.length === 0) return <p className="muted">Draw rooms and connect them with the Door tool.</p>;

  const N = doc.fanCount || 0;
  const names = (set: Set<string>) =>
    [...set].map((r) => roomById(doc.rooms, r)?.name).filter(Boolean) as string[];

  return (
    <>
      {air && air.active ? (
        <AirflowSummary air={air} plan={plan} names={names} />
      ) : (
        <p className="muted">
          Outside isn't cooler than your rooms — keep windows shut. The fans below are for comfort (moving air feels
          cooler), not for drawing in outside air.
        </p>
      )}

      {plan.spots.length === 0 ? (
        <p className="muted">No fan needed right now.</p>
      ) : N === 0 ? (
        <p className="muted">Set how many portable fans you have (Setup) and I'll place them.</p>
      ) : (
        <FanCards plan={plan} owned={N} />
      )}
    </>
  );

  function AirflowSummary({
    air,
    plan,
    names,
  }: {
    air: AirflowResult;
    plan: FanPlan;
    names: (set: Set<string>) => string[];
  }) {
    const flow = names(air.flowRooms),
      stag = names(air.stagnant),
      single = names(air.singleRooms);
    const st = plan.stack;
    const h = nowHour(weather);
    return (
      <div className="airflow-summary">
        {air.paths.length ? (
          <div>
            🌬️ Cross-breeze flowing through: <b>{flow.join(", ") || "—"}</b>. Arrows on the map show the path.
          </div>
        ) : (
          <div>
            🌬️ Windows are open but there's no through-path — you need open windows on two <i>different</i> sides linked
            by open doors.
          </div>
        )}
        {single.length > 0 && <div className="muted">~ One-sided airflow (limited): {single.join(", ")}.</div>}
        {stag.length > 0 && <div className="muted">⚠ Stagnant (no fresh air): {stag.join(", ")}.</div>}
        {air.doorSuggest.map((s, i) => (
          <div className="accent" key={i}>
            🚪 Open the door between <b>{s.aName}</b> and <b>{s.bName}</b> to connect the cross-breeze.
          </div>
        ))}

        {st && st.dH != null && st.exWin && st.inWin && h && (
          <StackCard st={st} dT={Math.max(0, (maxIndoor(doc.rooms) || 0) - h.temp)} />
        )}
      </div>
    );
  }

  function StackCard({ st, dT }: { st: NonNullable<FanPlan["stack"]>; dT: number }) {
    const drive = (st.dH || 0) * dT;
    const strength = drive > 9 ? "strong" : drive > 3.5 ? "moderate" : "gentle";
    const aIn = winArea(st.inWin!),
      aOut = winArea(st.exWin!);
    return (
      <div className="rec rec--physics">
        <div className="rec__ttl">
          <span>🌡️ Stack effect</span>
          <span className="muted">{strength}</span>
        </div>
        <div>
          Intake low at <b>{st.inSill!.toFixed(1)} m</b>, exhaust high at <b>{st.exTop!.toFixed(1)} m</b> → height gap{" "}
          <b>Δh {st.dH!.toFixed(1)} m</b>, with <b>ΔT {dT.toFixed(1)}°</b> inside-vs-out.
        </div>
        <div className="muted mt">
          Warm air rises and escapes high while cool air is pulled in low. The bigger Δh and ΔT, the stronger this free
          chimney draft — so raise the exhaust and lower the intake as far as the windows allow.
        </div>
        <div className="mt">
          💨{" "}
          {aIn >= aOut ? (
            <>
              For a <b>faster, cooler-feeling breeze</b>, open the exhaust fully and the intake ~⅓. By continuity
              (Bernoulli), a narrower inlet speeds up the incoming jet and throws it deeper into the room. Open both wide
              instead to flush heat fastest.
            </>
          ) : (
            <>
              Your intake is already smaller than the exhaust → the incoming air accelerates into a fast jet (Bernoulli).
              Widen the intake if you'd rather maximise total air exchange than breeze speed.
            </>
          )}
        </div>
        <div className="muted mt">
          📍 <b>Where to stand a fan:</b> it blows a focused jet but draws air diffusely.{" "}
          {doc.canSealFan ? (
            <>
              Seal <b>window</b> fans into the opening (an intake's back must face outside; seal an exhaust).
            </>
          ) : (
            <>
              You said your fans can't be sealed in, so stand <b>window</b> fans just inside the opening and stuff a towel
              into the gaps for a better seal.
            </>
          )}{" "}
          Stand <b>doorway</b> fans ~½ m back on the upstream side and aim through the gap — the jet entrains extra air and
          amplifies the flow.
        </div>
      </div>
    );
  }

  function FanCards({ plan, owned }: { plan: FanPlan; owned: number }) {
    const use = plan.spots.slice(0, owned),
      extra = plan.spots.slice(owned);
    return (
      <>
        <p className="hint">
          Place your <b>{owned}</b> portable fan{owned > 1 ? "s" : ""} here (numbered ghosts on the map, best first):
        </p>
        <p className="hint">
          These are starting points from the airflow model, not exact spots — nudge each fan to where the draught actually
          feels strongest.
        </p>
        {use.map((f, i) => (
          <FanCard key={i} idx={i} label={f.label} heightName={f.heightName} why={f.why} use />
        ))}
        {extra.length > 0 ? (
          <>
            <p className="hint mt">If you get more fans, next best spots:</p>
            {extra.map((f, i) => (
              <FanCard key={i} idx={i} label={f.label} heightName={f.heightName} why={f.why} use={false} />
            ))}
          </>
        ) : (
          plan.spots.length < owned && (
            <p className="hint">
              That's all the fans this layout needs right now — {plan.spots.length} spot
              {plan.spots.length > 1 ? "s" : ""}. Spare fans won't add much.
            </p>
          )
        )}
      </>
    );
  }

  function FanCard({
    idx,
    label,
    heightName,
    why,
    use,
  }: {
    idx: number;
    label: string;
    heightName: string;
    why: string;
    use: boolean;
  }) {
    return (
      <div className="rec" style={use ? undefined : { opacity: 0.6 }}>
        <div className="rec__ttl">
          <span>
            {use ? `▶ Fan ${idx + 1}` : "+ Extra"} · {label}
          </span>
        </div>
        <div>
          📐 <b>Height:</b> {heightName}
        </div>
        <div className="muted mt">{why}</div>
      </div>
    );
  }
}
