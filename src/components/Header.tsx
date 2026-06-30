import { useStore } from "../store/useStore";
import { Clock } from "./Clock";

interface Props {
  onHelp: () => void;
}

export function Header({ onHelp }: Props) {
  const location = useStore((s) => s.doc.location);
  const resetAll = useStore((s) => s.resetAll);

  return (
    <header className="appbar">
      <span className="appbar__logo" aria-hidden>
        🏠❄️
      </span>
      <div className="appbar__brand">
        <h1>CoolMiCasa</h1>
        <div className="appbar__sub">Passive cooling helper — no AC required</div>
      </div>

      <div className="appbar__right">
        <Clock />
        {location && <div className="appbar__loc">📍 {location.name}</div>}
        <div className="appbar__actions">
          <button onClick={onHelp}>How it works</button>
          <button
            className="danger"
            onClick={() => {
              if (confirm("Reset everything (layout, location, temperatures)?")) resetAll();
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </header>
  );
}
