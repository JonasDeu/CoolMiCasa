import { useStore } from "../../store/useStore";
import { useDerived } from "../../state/derived";
import { hh } from "../../lib/actions";

/**
 * The schedule: the handful of moments in the next ~24 h when the plan changes —
 * reopen / close-up flips, the coolest hour, rain, sun swinging onto glass.
 * Answers the second question after "what do I do now?": "when do I come back?"
 */
export function UpNext() {
  const { actions } = useDerived();
  const weather = useStore((s) => s.weather);

  if (!weather || !actions)
    return <p className="muted">Add a location and an indoor temperature to see when the plan changes.</p>;
  if (actions.upcoming.length === 0)
    return <p className="muted">No changes on the horizon — today's plan holds for the next 24 h.</p>;

  return (
    <div className="upnext">
      {actions.upcoming.map((u) => (
        <div className="up-row" key={`${u.hour}-${u.text}`}>
          <span className="up-row__time">≈{hh(u.hour)}</span>
          <span className="up-row__icon" aria-hidden>
            {u.icon}
          </span>
          <span className="up-row__text">{u.text}</span>
          <span className="tag">in {u.inH} h</span>
        </div>
      ))}
    </div>
  );
}
