import { useStore } from "../../store/useStore";
import type { FanSize, ThermalMass } from "../../types";
import { Card, Hint } from "../ui";

const FAN_SIZE_LABEL: Record<FanSize, string> = {
  small: "Small — desk / USB / clip-on (~20–25 cm)",
  medium: "Medium — table / pedestal (~30–40 cm)",
  large: "Large — box / floor / high-velocity (45 cm+)",
};

export function SettingsCard() {
  const comfort = useStore((s) => s.doc.comfort);
  const ceilingH = useStore((s) => s.doc.ceilingH);
  const fans = useStore((s) => s.doc.fans);
  const canSealFan = useStore((s) => s.doc.canSealFan);
  const mass = useStore((s) => s.doc.mass);
  const setComfort = useStore((s) => s.setComfort);
  const setCeiling = useStore((s) => s.setCeiling);
  const addFan = useStore((s) => s.addFan);
  const removeFan = useStore((s) => s.removeFan);
  const setFanSize = useStore((s) => s.setFanSize);
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
      {fans.length === 0 && <p className="muted">No fans yet — add one below.</p>}
      {fans.map((fan, i) => (
        <div className="row" key={fan.id}>
          <span className="tag" style={{ flex: "0 0 auto" }}>
            Fan {i + 1}
          </span>
          <select value={fan.size} onChange={(e) => setFanSize(fan.id, e.target.value as FanSize)}>
            <option value="small">{FAN_SIZE_LABEL.small}</option>
            <option value="medium">{FAN_SIZE_LABEL.medium}</option>
            <option value="large">{FAN_SIZE_LABEL.large}</option>
          </select>
          <button
            className="danger"
            style={{ flex: "0 0 auto" }}
            onClick={() => removeFan(fan.id)}
            title="Remove this fan"
          >
            ✕
          </button>
        </div>
      ))}
      <button className="full mt" onClick={() => addFan()} disabled={fans.length >= 8}>
        ＋ Add a fan
      </button>
      <Hint>
        List each fan and its size. The app picks the best spot &amp; height for each one, highest-impact first — and
        sends your biggest fan to the spot that moves the most air. Bigger fans flush the flat; small ones are aimed at
        you for a skin-cooling breeze instead.
      </Hint>

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
