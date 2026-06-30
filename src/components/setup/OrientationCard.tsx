import { useStore } from "../../store/useStore";
import { Card, Hint } from "../ui";

export function OrientationCard() {
  const northDeg = useStore((s) => s.doc.northDeg);
  const setNorth = useStore((s) => s.setNorth);

  return (
    <Card title="Orientation">
      <label>
        Rotate North (where “up” on the map points): <b>{northDeg}°</b>
      </label>
      <input type="range" min={0} max={359} value={northDeg} onChange={(e) => setNorth(+e.target.value)} />
      <Hint>
        Drag so the compass matches your flat. East gets morning sun, West the hot evening sun. The compass + sun marker
        on the map update live.
      </Hint>
    </Card>
  );
}
