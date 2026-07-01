import { useStore } from "../../store/useStore";
import type { ThermalMass } from "../../types";
import { Card, Hint } from "../ui";

export function SettingsCard() {
  const comfort = useStore((s) => s.doc.comfort);
  const ceilingH = useStore((s) => s.doc.ceilingH);
  const fanCount = useStore((s) => s.doc.fanCount);
  const canSealFan = useStore((s) => s.doc.canSealFan);
  const mass = useStore((s) => s.doc.mass);
  const setComfort = useStore((s) => s.setComfort);
  const setCeiling = useStore((s) => s.setCeiling);
  const setFanCount = useStore((s) => s.setFanCount);
  const setCanSealFan = useStore((s) => s.setCanSealFan);
  const setMass = useStore((s) => s.setMass);

  return (
    <Card title="Comfort & home">
      <label>Default target temperature (°C)</label>
      <input
        type="number"
        step={0.5}
        value={comfort}
        onChange={(e) => setComfort(parseFloat(e.target.value) || 24)}
      />
      <Hint>Used for any room without its own target. Set a per-room target on a selected room.</Hint>

      <label>Ceiling height (m)</label>
      <input
        type="number"
        step={0.1}
        min={2}
        value={ceilingH}
        onChange={(e) => setCeiling(parseFloat(e.target.value) || 2.5)}
      />
      <Hint>Drives the stack effect: a taller gap between a low intake and a high exhaust gives a stronger draft.</Hint>

      <label>Building / walls (thermal mass)</label>
      <select value={mass} onChange={(e) => setMass(e.target.value as ThermalMass)}>
        <option value="light">Lightweight — timber, drywall, prefab</option>
        <option value="medium">Average — mixed construction</option>
        <option value="heavy">Heavy masonry — brick, concrete, stone</option>
      </select>
      <Hint>
        Heavy walls hold cool longer but need a longer cool spell to flush. This tunes how long the timeline says an open
        window is worth it.
      </Hint>

      <label>Portable fans you own</label>
      <input
        type="number"
        step={1}
        min={0}
        max={8}
        value={fanCount}
        onChange={(e) => setFanCount(parseInt(e.target.value) || 0)}
      />
      <Hint>The app picks the best spot &amp; height for each one, highest-impact first.</Hint>

      <label className="checkbox">
        <input type="checkbox" checked={canSealFan} onChange={(e) => setCanSealFan(e.target.checked)} /> I can seal a fan
        into a window opening
      </label>
      <Hint>
        Most portable fans can't be made airtight in a window. Leave this off and the plan will have you stand fans by the
        opening (and block gaps with a towel) instead of sealing them in.
      </Hint>
    </Card>
  );
}
