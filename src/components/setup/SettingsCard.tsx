import { useStore } from "../../store/useStore";
import { Card, Hint } from "../ui";

export function SettingsCard() {
  const comfort = useStore((s) => s.doc.comfort);
  const ceilingH = useStore((s) => s.doc.ceilingH);
  const fanCount = useStore((s) => s.doc.fanCount);
  const setComfort = useStore((s) => s.setComfort);
  const setCeiling = useStore((s) => s.setCeiling);
  const setFanCount = useStore((s) => s.setFanCount);

  return (
    <Card title="Comfort & home">
      <label>Target indoor temperature (°C)</label>
      <input
        type="number"
        step={0.5}
        value={comfort}
        onChange={(e) => setComfort(parseFloat(e.target.value) || 24)}
      />
      <Hint>Rooms above this should be cooled; below it, keep the heat out.</Hint>

      <label>Ceiling height (m)</label>
      <input
        type="number"
        step={0.1}
        min={2}
        value={ceilingH}
        onChange={(e) => setCeiling(parseFloat(e.target.value) || 2.5)}
      />
      <Hint>
        Drives the stack effect: a taller gap between a low intake and a high exhaust gives a stronger natural draft.
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
    </Card>
  );
}
