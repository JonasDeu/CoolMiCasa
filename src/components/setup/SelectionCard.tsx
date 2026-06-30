import { useStore } from "../../store/useStore";
import { useDerived } from "../../state/derived";
import {
  compassName,
  roomById,
  windowFacing,
  winHeight,
  winSill,
  winTop,
} from "../../lib/geometry";
import { fmt } from "../../lib/recommend";
import type { Side } from "../../types";
import { Card, Hint } from "../ui";

const SIDE_LABEL: Record<Side, string> = { N: "top", E: "right", S: "bottom", W: "left" };

export function SelectionCard() {
  const selection = useStore((s) => s.selection);
  const doc = useStore((s) => s.doc);
  const { temps } = useDerived();
  const updateRoom = useStore((s) => s.updateRoom);
  const updateWindow = useStore((s) => s.updateWindow);
  const updateDoor = useStore((s) => s.updateDoor);
  const deleteItem = useStore((s) => s.deleteItem);

  if (!selection) return null;

  const del = (
    <button className="danger full mt" onClick={() => deleteItem(selection)}>
      🗑 Delete this
    </button>
  );

  if (selection.type === "room") {
    const r = roomById(doc.rooms, selection.id);
    if (!r) return null;
    const hasSensor = r.measured !== false;
    const estimate = temps[r.id];
    const pxPerM = doc.pxPerM || 50;
    return (
      <Card title="Selected room">
        <label>Room name</label>
        <input type="text" value={r.name} onChange={(e) => updateRoom(r.id, { name: e.target.value })} />

        <label className="checkbox">
          <input
            type="checkbox"
            checked={hasSensor}
            onChange={(e) => updateRoom(r.id, { measured: e.target.checked })}
          />{" "}
          I have a thermometer in this room
        </label>

        {hasSensor ? (
          <>
            <label>Measured temperature (°C)</label>
            <input
              type="number"
              step={0.5}
              value={Number.isFinite(r.temp) ? r.temp : ""}
              onChange={(e) => updateRoom(r.id, { temp: parseFloat(e.target.value) })}
            />
            <Hint>Or double-click the room on the map to type it there.</Hint>
          </>
        ) : (
          <Hint>
            No sensor → estimated at <b>~{estimate ? fmt(estimate.value) : "—"}°</b> from your measured rooms and the sun.
            Tick the box above if you can measure it.
          </Hint>
        )}

        <label>Target temperature (°C)</label>
        <input
          type="number"
          step={0.5}
          value={r.target == null ? "" : r.target}
          placeholder={`default ${doc.comfort}°`}
          onChange={(e) => updateRoom(r.id, { target: e.target.value === "" ? null : parseFloat(e.target.value) })}
        />
        <Hint>Blank = use the default ({doc.comfort}°). A bedroom you want cooler at night can have its own target.</Hint>

        <Hint>
          Size: <b>{(r.w / pxPerM).toFixed(1)} × {(r.h / pxPerM).toFixed(1)} m</b>. Name a corridor “Hallway” so airflow
          routes through it.
        </Hint>
        {del}
      </Card>
    );
  }

  if (selection.type === "window") {
    const w = doc.windows.find((x) => x.id === selection.id);
    if (!w) return null;
    const r = roomById(doc.rooms, w.roomId);
    return (
      <Card title="Selected window">
        <Hint>
          In <b>{r ? r.name : "?"}</b> · faces <b>{compassName(windowFacing(w, doc.northDeg))}</b> (
          {Math.round(windowFacing(w, doc.northDeg))}°)
        </Hint>
        <label>🌡 Outdoor temp in front of this window (°C)</label>
        <input
          type="number"
          step={0.5}
          value={w.temp == null ? "" : w.temp}
          placeholder="blank = use area forecast"
          onChange={(e) => updateWindow(w.id, { temp: e.target.value === "" ? null : parseFloat(e.target.value) })}
        />
        <Hint>A shaded courtyard window can be several degrees cooler than the rooftop forecast.</Hint>

        <label>Wall</label>
        <select value={w.side} onChange={(e) => updateWindow(w.id, { side: e.target.value as Side })}>
          {(["N", "E", "S", "W"] as Side[]).map((s) => (
            <option key={s} value={s}>
              {s} side (map {SIDE_LABEL[s]})
            </option>
          ))}
        </select>

        <label>Width on wall: {w.len}px</label>
        <input type="range" min={30} max={200} value={w.len} onChange={(e) => updateWindow(w.id, { len: +e.target.value })} />

        <div className="row">
          <div>
            <label>Sill height (m)</label>
            <input
              type="number"
              step={0.1}
              min={0}
              value={winSill(w)}
              onChange={(e) => updateWindow(w.id, { sill: e.target.value === "" ? null : parseFloat(e.target.value) })}
            />
          </div>
          <div>
            <label>Window height (m)</label>
            <input
              type="number"
              step={0.1}
              min={0.1}
              value={winHeight(w)}
              onChange={(e) => updateWindow(w.id, { winH: e.target.value === "" ? null : parseFloat(e.target.value) })}
            />
          </div>
        </div>
        <Hint>
          Top of glass: <b>{winTop(w, doc.ceilingH).toFixed(1)} m</b>. These drive the stack-effect fan heights.
        </Hint>

        <label className="checkbox">
          <input type="checkbox" checked={w.shade} onChange={(e) => updateWindow(w.id, { shade: e.target.checked })} />{" "}
          Has a shade / blind / curtain
        </label>
        {del}
      </Card>
    );
  }

  // door
  const d = doc.doors.find((x) => x.id === selection.id);
  if (!d) return null;
  const ra = roomById(doc.rooms, d.roomA),
    rb = roomById(doc.rooms, d.roomB);
  return (
    <Card title="Selected door">
      <Hint>
        Connects <b>{ra ? ra.name : "?"}</b> ↔ <b>{rb ? rb.name : "?"}</b>
      </Hint>
      <label className="checkbox">
        <input type="checkbox" checked={d.open} onChange={(e) => updateDoor(d.id, { open: e.target.checked })} /> Door open
        (air can pass)
      </label>
      <Hint>Drag it along the shared wall to line up with the real opening. Open doors let the cross-breeze flow.</Hint>
      {del}
    </Card>
  );
}
