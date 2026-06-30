import { useStore } from "../../store/useStore";
import { Card, Hint } from "../ui";

export function SettingsCard() {
  const comfort = useStore((s) => s.doc.comfort);
  const ceilingH = useStore((s) => s.doc.ceilingH);
  const fanCount = useStore((s) => s.doc.fanCount);
  const pxPerM = useStore((s) => s.doc.pxPerM);
  const canSealFan = useStore((s) => s.doc.canSealFan);
  const setComfort = useStore((s) => s.setComfort);
  const setCeiling = useStore((s) => s.setCeiling);
  const setFanCount = useStore((s) => s.setFanCount);
  const setPxPerM = useStore((s) => s.setPxPerM);
  const setCanSealFan = useStore((s) => s.setCanSealFan);

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

      <label>
        Map scale: <b>1 m = {pxPerM} px</b>
      </label>
      <input type="range" min={20} max={120} value={pxPerM} onChange={(e) => setPxPerM(+e.target.value)} />
      <Hint>Slide so the rooms read at a believable size — the scale bar &amp; room dimensions on the map update live.</Hint>

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
