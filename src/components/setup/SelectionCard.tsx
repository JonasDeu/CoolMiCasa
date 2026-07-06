import { useStore } from "../../store/useStore";
import { useDerived } from "../../state/derived";
import {
  cmToLen,
  compassName,
  doorManaged,
  PX_PER_M,
  roomById,
  windowFacing,
  windowFixedOpen,
  windowManaged,
  winHeight,
  winSill,
  winTop,
  winWidthCm,
} from "../../lib/geometry";
import { fmt, nowHour } from "../../lib/recommend";
import { dewPointC, MUGGY_DEW } from "../../lib/humidity";
import { estimateAsUnmeasured } from "../../lib/temps";
import type { Side } from "../../types";
import { Card, Hint } from "../ui";

const SIDE_LABEL: Record<Side, string> = { N: "top", E: "right", S: "bottom", W: "left" };

export function SelectionCard() {
  const selection = useStore((s) => s.selection);
  const doc = useStore((s) => s.doc);
  const weather = useStore((s) => s.weather);
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
    const hasHygro = r.rh != null && Number.isFinite(+r.rh);
    const estimate = temps[r.id];
    const modeled = hasSensor && Number.isFinite(+r.temp) ? estimateAsUnmeasured(doc, r.id, weather) : null;
    return (
      <Card title="Selected room">
        <label>Room name</label>
        <input type="text" value={r.name} onChange={(e) => updateRoom(r.id, { name: e.target.value })} />

        <label className="checkbox">
          <input
            type="checkbox"
            checked={!!r.priority}
            onChange={(e) => updateRoom(r.id, { priority: e.target.checked })}
          />{" "}
          ⭐ Priority room — cool this one first
        </label>
        <Hint>
          Flag the room you care most about (a bedroom at night). The cross-breeze is routed through it first, and it's first
          in line for a fan.
        </Hint>

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
            {modeled != null && Number.isFinite(+r.temp) && (
              <Hint>
                🔎 The model would guess <b>~{fmt(modeled)}°</b> here from your other rooms (you measured {fmt(r.temp)}°,{" "}
                {r.temp - modeled >= 0 ? "+" : ""}
                {fmt(r.temp - modeled)}°).{" "}
                {Math.abs(r.temp - modeled) >= 2
                  ? "Big gap → trust the estimated rooms elsewhere less."
                  : "Close → the estimates elsewhere are probably reliable."}
              </Hint>
            )}
          </>
        ) : (
          <Hint>
            No sensor → estimated at <b>~{estimate ? fmt(estimate.value) : "—"}°</b>
            {estimate?.lo != null && (
              <>
                {" "}
                (range {fmt(estimate.lo)}–{fmt(estimate.hi)}°)
              </>
            )}{" "}
            from your measured rooms and the sun. Tick the box above if you can measure it.
          </Hint>
        )}

        <label className="checkbox">
          <input
            type="checkbox"
            checked={hasHygro}
            onChange={(e) => updateRoom(r.id, { rh: e.target.checked ? 55 : null })}
          />{" "}
          I have a hygrometer in this room
        </label>
        {hasHygro ? (
          <>
            <label>Measured humidity (% RH)</label>
            <input
              type="number"
              step={1}
              min={0}
              max={100}
              value={r.rh ?? ""}
              onChange={(e) => updateRoom(r.id, { rh: e.target.value === "" ? null : parseFloat(e.target.value) })}
            />
            {Number.isFinite(+r.temp) && r.rh != null && (
              <Hint>
                Dew point <b>{fmt(dewPointC(+r.temp, +r.rh))}°</b>
                {dewPointC(+r.temp, +r.rh) >= MUGGY_DEW
                  ? " — muggy indoors; opening up only helps comfort if the outside air is drier."
                  : " — comfortably dry air."}
              </Hint>
            )}

            <label>Target humidity (% RH)</label>
            <input
              type="number"
              step={1}
              min={0}
              max={100}
              value={r.rhTarget == null ? "" : r.rhTarget}
              placeholder="optional — blank = no target"
              onChange={(e) => updateRoom(r.id, { rhTarget: e.target.value === "" ? null : parseFloat(e.target.value) })}
            />
            <Hint>
              Optional ceiling. The room is flagged (on the map and in the advice) when its humidity climbs above this — handy
              for keeping a bedroom under, say, 55%.
            </Hint>
          </>
        ) : (
          <Hint>
            Optional. With a reading, the app compares indoor vs outdoor dew point and warns when opening the windows would
            trade a small temperature drop for a lot more humidity.
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
          Size: <b>{(r.w / PX_PER_M).toFixed(1)} × {(r.h / PX_PER_M).toFixed(1)} m</b>. Air routes between rooms through open
          doors — connect a corridor with the Door tool so a cross-breeze can pass.
        </Hint>
        {del}
      </Card>
    );
  }

  if (selection.type === "window") {
    const w = doc.windows.find((x) => x.id === selection.id);
    if (!w) return null;
    const r = roomById(doc.rooms, w.roomId);
    const oh = nowHour(weather);
    const outT = w.temp != null ? +w.temp : oh ? oh.temp : weather?.current.temp ?? null;
    const outRh = w.rh != null ? +w.rh : oh ? oh.rh : weather?.current.rh ?? null;
    const outDew = outT != null && outRh != null ? dewPointC(outT, outRh) : null;
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

        <label>💧 Outdoor humidity in front of this window (% RH)</label>
        <input
          type="number"
          step={1}
          min={0}
          max={100}
          value={w.rh == null ? "" : w.rh}
          placeholder="blank = use area forecast"
          onChange={(e) => updateWindow(w.id, { rh: e.target.value === "" ? null : parseFloat(e.target.value) })}
        />
        <Hint>
          {outDew != null ? (
            <>
              Air here: <b>{fmt(outT)}°</b> · <b>{Math.round(outRh as number)}% RH</b> → dew point <b>{fmt(outDew)}°</b>
              {outDew >= MUGGY_DEW ? " — muggy; opening trades heat for stickiness." : " — dry enough to flush freely."}{" "}
            </>
          ) : (
            "Optional. "
          )}
          A hygrometer by a shaded/ground-level window catches damp air the rooftop forecast misses, sharpening the open-vs-seal call.
        </Hint>

        <label>Wall</label>
        <select value={w.side} onChange={(e) => updateWindow(w.id, { side: e.target.value as Side })}>
          {(["N", "E", "S", "W"] as Side[]).map((s) => (
            <option key={s} value={s}>
              {s} side (map {SIDE_LABEL[s]})
            </option>
          ))}
        </select>

        <label>Width on wall (cm)</label>
        <input
          type="number"
          step={5}
          min={20}
          max={400}
          value={winWidthCm(w)}
          onChange={(e) => {
            const cm = parseFloat(e.target.value);
            if (Number.isFinite(cm)) updateWindow(w.id, { len: cmToLen(Math.max(20, Math.min(400, cm))) });
          }}
        />
        <Hint>Opening width along the wall. Double-click the window on the map to edit this there too.</Hint>

        <label>Opening</label>
        <select
          value={w.opening === "tilt" ? "tilt" : "full"}
          onChange={(e) => updateWindow(w.id, { opening: e.target.value === "tilt" ? "tilt" : "full" })}
        >
          <option value="full">Opens fully (wide open)</option>
          <option value="tilt">Tilt only — gekippt</option>
        </select>
        <Hint>
          A tilted (<i>gekippt</i>) window only cracks a wedge at the top, so it ventilates roughly a fifth as much as one
          thrown wide — the airflow model and fan plan account for it. Shown dashed with a “kipp” tag on the map.
        </Hint>

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

        <label className="checkbox">
          <input
            type="checkbox"
            checked={windowManaged(w)}
            onChange={(e) => updateWindow(w.id, { allowOverwrite: e.target.checked })}
          />{" "}
          Let the plan open/close this window
        </label>
        {windowManaged(w) ? (
          <Hint>
            The app decides this window's sash hour-by-hour and lists it in the open/close steps. Untick to <b>lock</b> it —
            the advice will then respect the state you set and never tell you to change it.
          </Hint>
        ) : (
          <>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={windowFixedOpen(w)}
                onChange={(e) => updateWindow(w.id, { open: e.target.checked })}
              />{" "}
              Currently open (air can pass)
            </label>
            <Hint>
              🔒 Locked: the airflow model treats this window as <b>{windowFixedOpen(w) ? "open" : "shut"}</b> and won't
              suggest changing it. Re-tick “Let the plan open/close” to hand control back.
            </Hint>
          </>
        )}
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

      <label className="checkbox">
        <input
          type="checkbox"
          checked={doorManaged(d)}
          onChange={(e) => updateDoor(d.id, { allowOverwrite: e.target.checked })}
        />{" "}
        Let the plan open/close this door
      </label>
      <Hint>
        {doorManaged(d)
          ? "The advice may tell you to open or close this door for the breeze, and a fan can be routed through it."
          : "🔒 Locked (default): the plan works around the state you set — it won't nag you to flip it, and won't aim a fan through it while it's shut."}
      </Hint>
      {del}
    </Card>
  );
}
