import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function HelpDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  return (
    <dialog ref={ref} className="help-dialog" onClose={onClose}>
      <h1>How CoolMiCasa works</h1>
      <p>
        The trick to cooling a flat without AC is timing: <b>let cool air in only when it's cooler outside than
        inside</b>, and <b>seal the place up and block the sun</b> the rest of the time.
      </p>
      <ol>
        <li>
          <b>Set your location</b> — fetches the real hourly outdoor temperature, sun and wind for your spot (free
          Open-Meteo API).
        </li>
        <li>
          <b>Draw your flat</b> — start from a Quick-start template or draw rooms, place windows, then use the <b>Door</b>{" "}
          tool to connect adjacent rooms so the app can trace how air flows.
        </li>
        <li>
          <b>Read the airflow</b> — when it's cooler outside, blue arrows show the cross-breeze path (intake → open doors
          → exhaust). Rooms off the path are flagged stagnant.
        </li>
        <li>
          <b>Follow the badges</b> — every window gets an explicit OPEN / CLOSE / SHADE call (a purple bar means: blind
          down), and every door shows a ✓ when it's in the right position or a pulsing <b>→ OPEN</b> / <b>→ SHUT</b> hint
          when you should flip it (double-click the door).
        </li>
        <li>
          <b>Say how many fans you have</b> — the app ranks the best spots and heights: exhaust high where hot air pools
          (stack effect), intake low for cool night air, and a doorway booster where air accelerates (Bernoulli).
        </li>
        <li>
          <b>Rotate North</b> so the compass matches reality. The app computes exactly which windows the sun hits, hour
          by hour.
        </li>
        <li>
          <b>Type the temperature</b> you measure in each room (and optionally right at a window).
        </li>
        <li>
          Read the headline banner and <b>Next 24h</b> timeline. Green = open &amp; ventilate, orange = keep closed,
          yellow = sun on glass so close the shade.
        </li>
      </ol>
      <p className="hint">
        Everything is saved in your browser. No account; nothing leaves your machine except the weather lookup.
      </p>
      <button className="primary mt" onClick={onClose}>
        Got it
      </button>
    </dialog>
  );
}
