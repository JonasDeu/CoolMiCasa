import { useStore } from "../../store/useStore";
import { useDerived } from "../../state/derived";
import { hh, type Step } from "../../lib/actions";

const PILL: Record<Step["kind"], string> = {
  shade: "pill--shade",
  open: "pill--open",
  close: "pill--closed",
  door: "", // resolved by verb below
  fan: "pill--fan",
};

const pillClass = (s: Step) =>
  s.kind === "door" ? (s.verb === "OPEN" ? "pill--open" : "pill--closed") : PILL[s.kind];

/**
 * The checklist. One numbered, priority-ordered list of every physical action —
 * shade, open, close, flip a door, place a fan — each with a one-line reason.
 * The user should be able to walk through the flat top-to-bottom and be done.
 */
export function ActionList() {
  const { docEff: doc, temps, actions } = useDerived();
  const weather = useStore((s) => s.weather);

  if (!doc.location)
    return <p className="muted">Set your location in Settings ⚙ to fetch the outdoor temperature, sun and wind.</p>;
  if (!weather) return <p className="muted">Loading weather…</p>;
  if (!actions)
    return (
      <p className="muted">
        The app needs one indoor temperature to compare against outside: double-click a room on the map and type a
        reading — or set a quick indoor temp in Settings ⚙.
      </p>
    );

  const anyEst = doc.rooms.some((r) => temps[r.id]?.estimated);
  const next = actions.upcoming[0];

  return (
    <>
      <div className={`plan-goal plan-goal--${actions.mode}`}>{actions.goal}</div>
      {actions.caveat && <div className="caveat">{actions.caveat}</div>}
      {actions.muggy && <div className="caveat">{actions.muggy}</div>}

      {anyEst && (
        <div className="warnbox">
          Rooms marked ~ have no thermometer and are <b>estimated</b>. Double-click one on the map and enter a real
          reading for sharper advice.
        </div>
      )}

      {doc.rooms.length === 0 && (
        <p className="muted">👉 Draw your rooms &amp; windows on the map for step-by-step open/close/shade calls.</p>
      )}
      {doc.rooms.length > 0 && doc.windows.length === 0 && (
        <p className="muted">No windows drawn yet — add them with the Window tool to get open/close calls.</p>
      )}

      {actions.steps.length > 0 ? (
        <ol className="steps">
          {actions.steps.map((s, i) => (
            <li className="step" key={s.id}>
              <span className="step__n">{i + 1}</span>
              <div className="step__body">
                <div className="step__head">
                  <span className={`pill ${pillClass(s)}`}>{s.verb}</span>
                  <b>{s.title}</b>
                </div>
                <div className="step__why">{s.why}</div>
                {s.note && <div className="step__note">{s.note}</div>}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        doc.rooms.length > 0 && (
          <div className="allset">
            ✅ Nothing to change — the flat already matches the plan.
            {next && (
              <span className="allset__next">
                {" "}
                Next: ≈{hh(next.hour)} — {next.text.toLowerCase()}
              </span>
            )}
          </div>
        )
      )}

      {actions.fanHint && <p className="hint">🌀 {actions.fanHint}</p>}

      {actions.confirmed.length > 0 && (
        <details className="confirmed">
          <summary>✓ Already right — leave as is ({actions.confirmed.length})</summary>
          <ul>
            {actions.confirmed.map((c) => (
              <li key={c.id}>{c.text}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
