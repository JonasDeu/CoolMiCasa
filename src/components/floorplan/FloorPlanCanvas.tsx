import { useEffect, useRef, useState } from "react";
import type { Door, Pt, Room, WindowItem } from "../../types";
import { cmToLen, roomById, windowMid, winWidthCm } from "../../lib/geometry";
import { useStore } from "../../store/useStore";
import { useDerived } from "../../state/derived";
import { drawScene } from "./draw";

const CW = 900;
const CH = 620;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25; // per button press
const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

type Drag =
  | { mode: "draw"; id: string; sx: number; sy: number }
  | { mode: "move"; id: string; dx: number; dy: number }
  | { mode: "resize"; id: string }
  | { mode: "door"; id: string }
  | { mode: "win"; id: string }
  | { mode: "pan"; sx: number; sy: number; ox: number; oy: number; deselect: boolean; moved: boolean }
  | null;

interface Editing {
  kind: "room" | "window";
  id: string;
  left: number;
  top: number;
}

export function FloorPlanCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [view, setView] = useState<Pt>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);
  // latest view/zoom for the imperative (non-passive) wheel listener
  const camRef = useRef({ view, zoom });
  camRef.current = { view, zoom };

  const weather = useStore((s) => s.weather);
  const selection = useStore((s) => s.selection);
  const rawDoc = useStore((s) => s.doc); // raw stored values for the inline editors
  const updateRoom = useStore((s) => s.updateRoom);
  const updateWindow = useStore((s) => s.updateWindow);
  const { docEff: doc, temps, air, plan, openings } = useDerived();

  // redraw whenever anything visible changes; while airflow or fan spots are on
  // screen, keep a ~30fps loop running so the flow dashes crawl along their paths
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const opts = { width: CW, height: CH, view, zoom, doc, weather, air, openings, fanSpots: plan.spots, selection, temps };
    // keep the ~30fps loop alive while flow dashes, fan jets or door-change pulses are visible
    const animated = (air.active && air.paths.length > 0) || plan.spots.length > 0 || openings.doorChanges > 0;
    let raf = 0,
      last = -Infinity;
    const frame = (t: number) => {
      if (t - last >= 33) {
        last = t;
        drawScene(ctx, { ...opts, now: t });
      }
      raf = requestAnimationFrame(frame);
    };
    drawScene(ctx, { ...opts, now: performance.now() });
    if (animated) raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [doc, weather, air, plan, openings, selection, temps, view, zoom]);

  // close the inline editor when clicking anywhere outside it
  useEffect(() => {
    if (!editing) return;
    function onDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setEditing(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [editing]);

  // wheel = zoom about the cursor. A native non-passive listener lets us preventDefault
  // so the page never scrolls while zooming the map.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const r = cv!.getBoundingClientRect();
      const fx = ((e.clientX - r.left) * CW) / r.width;
      const fy = ((e.clientY - r.top) * CH) / r.height;
      zoomTo(camRef.current.zoom * Math.exp(-e.deltaY * 0.0015), fx, fy);
    }
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Pointer position in canvas pixels (ignores pan) — used for pan math. */
  function toPixel(ev: React.PointerEvent | React.MouseEvent): Pt {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) * CW) / r.width,
      y: ((ev.clientY - r.top) * CH) / r.height,
    };
  }
  /** Pointer position in map coordinates (accounts for pan and zoom). */
  function toCanvas(ev: React.PointerEvent | React.MouseEvent): Pt {
    const p = toPixel(ev);
    return { x: (p.x - view.x) / zoom, y: (p.y - view.y) / zoom };
  }

  /** Zoom to `next` while keeping the canvas-px focal point (fx, fy) pinned in place. */
  function zoomTo(next: number, fx: number, fy: number) {
    const { view: v, zoom: z } = camRef.current;
    const nz = clampZoom(next);
    if (nz === z) return;
    const mx = (fx - v.x) / z,
      my = (fy - v.y) / z;
    setView({ x: fx - mx * nz, y: fy - my * nz });
    setZoom(nz);
  }
  /** Button/keyboard zoom, anchored on the middle of the viewport. */
  const zoomStep = (factor: number) => zoomTo(camRef.current.zoom * factor, CW / 2, CH / 2);
  const resetView = () => {
    setView({ x: 0, y: 0 });
    setZoom(1);
  };

  // click tolerances are in map units; divide by zoom to keep a constant on-screen reach
  function hitWindow(p: Pt): WindowItem | null {
    const tol = 14 / zoom;
    for (const w of doc.windows) {
      const m = windowMid(w, doc.rooms);
      if (m && Math.hypot(p.x - m.x, p.y - m.y) < tol) return w;
    }
    return null;
  }
  function hitDoor(p: Pt): Door | null {
    const tol = 13 / zoom;
    for (const d of doc.doors) if (Math.hypot(p.x - d.x, p.y - d.y) < tol) return d;
    return null;
  }
  function hitRoom(p: Pt): Room | null {
    for (let i = doc.rooms.length - 1; i >= 0; i--) {
      const r = doc.rooms[i];
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return r;
    }
    return null;
  }
  function onHandle(p: Pt, r: Room): boolean {
    return p.x >= r.x + r.w - 9 && p.x <= r.x + r.w + 6 && p.y >= r.y + r.h - 9 && p.y <= r.y + r.h + 6;
  }

  function startPan(ev: React.PointerEvent, deselect: boolean) {
    const px = toPixel(ev);
    setPanning(true);
    dragRef.current = { mode: "pan", sx: px.x, sy: px.y, ox: view.x, oy: view.y, deselect, moved: false };
  }

  function onPointerDown(ev: React.PointerEvent) {
    const s = useStore.getState();
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);

    // middle-button drag pans the map regardless of the active tool
    if (ev.button === 1) {
      ev.preventDefault();
      startPan(ev, false);
      return;
    }

    const p = toCanvas(ev);

    if (s.tool === "room") {
      const id = s.addRoomAt(p);
      dragRef.current = { mode: "draw", id, sx: p.x, sy: p.y };
      return;
    }
    if (s.tool === "window") {
      const id = s.addWindowAt(p);
      if (!id) s.flash("Draw a room first, then click a wall to add a window.");
      return;
    }
    if (s.tool === "door") {
      const res = s.addDoorAt(p);
      if (res.msg) s.flash(res.msg);
      return;
    }

    // select tool
    const dr = hitDoor(p);
    if (dr) {
      s.select({ type: "door", id: dr.id });
      dragRef.current = { mode: "door", id: dr.id };
      return;
    }
    const win = hitWindow(p);
    if (win) {
      s.select({ type: "window", id: win.id });
      dragRef.current = { mode: "win", id: win.id };
      return;
    }
    const room = hitRoom(p);
    if (room) {
      s.select({ type: "room", id: room.id });
      if (onHandle(p, room)) dragRef.current = { mode: "resize", id: room.id };
      else dragRef.current = { mode: "move", id: room.id, dx: p.x - room.x, dy: p.y - room.y };
      return;
    }

    // empty space → pan; a click without movement clears the selection
    startPan(ev, true);
  }

  function onPointerMove(ev: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === "pan") {
      const px = toPixel(ev);
      setView({ x: drag.ox + (px.x - drag.sx), y: drag.oy + (px.y - drag.sy) });
      if (!drag.moved && Math.hypot(px.x - drag.sx, px.y - drag.sy) > 3) drag.moved = true;
      return;
    }
    const s = useStore.getState();
    const p = toCanvas(ev);
    if (drag.mode === "draw") {
      s.dragRoomDraw(
        drag.id,
        Math.min(drag.sx, p.x),
        Math.min(drag.sy, p.y),
        Math.abs(p.x - drag.sx),
        Math.abs(p.y - drag.sy),
      );
    } else if (drag.mode === "move") {
      s.dragRoomMove(drag.id, p.x - drag.dx, p.y - drag.dy);
    } else if (drag.mode === "resize") {
      const r = roomById(s.doc.rooms, drag.id);
      if (r) s.dragRoomResize(drag.id, p.x - r.x, p.y - r.y);
    } else if (drag.mode === "door") {
      s.dragDoorMove(drag.id, p);
    } else if (drag.mode === "win") {
      s.dragWindowSnap(drag.id, p);
    }
  }

  function onPointerUp() {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === "pan") {
      if (drag.deselect && !drag.moved) useStore.getState().select(null);
      setPanning(false);
      dragRef.current = null;
      return;
    }
    const s = useStore.getState();
    if (drag.mode === "draw") s.endDrawRoom(drag.id);
    else s.commit();
    dragRef.current = null;
  }

  /** Canvas map-point → CSS px within the wrapper, following the current pan & zoom. */
  function toScreen(mx: number, my: number) {
    const cv = canvasRef.current!;
    const css = cv.getBoundingClientRect().width / CW;
    return { x: (mx * zoom + view.x) * css, y: (my * zoom + view.y) * css };
  }

  function openRoomEditor(r: Room) {
    if (!canvasRef.current) return;
    const s = toScreen(r.x, r.y);
    setEditing({ kind: "room", id: r.id, left: s.x + 6, top: s.y + 24 });
  }

  function openWindowEditor(w: WindowItem) {
    if (!canvasRef.current) return;
    const m = windowMid(w, doc.rooms);
    if (!m) return;
    const s = toScreen(m.x, m.y);
    setEditing({ kind: "window", id: w.id, left: s.x + 8, top: s.y + 8 });
  }

  function onDoubleClick(ev: React.MouseEvent) {
    const s = useStore.getState();
    const p = toCanvas(ev);
    const d = hitDoor(p);
    if (d) {
      s.toggleDoor(d.id);
      const a = roomById(doc.rooms, d.roomA),
        b = roomById(doc.rooms, d.roomB);
      s.flash(`${a?.name} ↔ ${b?.name} door is now ${d.open ? "SHUT" : "OPEN"}.`);
      return;
    }
    const w = hitWindow(p);
    if (w) {
      s.select({ type: "window", id: w.id });
      openWindowEditor(w);
      return;
    }
    const r = hitRoom(p);
    if (r) {
      s.select({ type: "room", id: r.id });
      openRoomEditor(r);
    }
  }

  function onContextMenu(ev: React.MouseEvent) {
    ev.preventDefault();
    const s = useStore.getState();
    const p = toCanvas(ev);
    const d = hitDoor(p);
    if (d) return s.deleteItem({ type: "door", id: d.id });
    const w = hitWindow(p);
    if (w) return s.deleteItem({ type: "window", id: w.id });
    const r = hitRoom(p);
    if (r) {
      s.select({ type: "room", id: r.id });
      s.flash("Right-clicked a room — press Del to remove it (and its windows).");
    }
  }

  const closeOnKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "Escape") setEditing(null);
  };

  const editRoom = editing?.kind === "room" ? roomById(rawDoc.rooms, editing.id) : null;
  const editWin = editing?.kind === "window" ? rawDoc.windows.find((x) => x.id === editing.id) : null;

  return (
    <>
      <canvas
        ref={canvasRef}
        className={"floorplan-canvas" + (panning ? " is-panning" : "")}
        width={CW}
        height={CH}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      />
      <div className="zoom-ctl">
        <button type="button" title="Zoom in" aria-label="Zoom in" onClick={() => zoomStep(ZOOM_STEP)}>
          ＋
        </button>
        <button
          type="button"
          className="zoom-ctl__level"
          title="Reset zoom & recenter"
          aria-label="Reset zoom and recenter"
          onClick={resetView}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button type="button" title="Zoom out" aria-label="Zoom out" onClick={() => zoomStep(1 / ZOOM_STEP)}>
          －
        </button>
      </div>
      {editRoom && editing && (
        <div ref={popRef} className="temp-edit" style={{ left: editing.left, top: editing.top }}>
          <div className="temp-edit__row">
            <label>Now</label>
            <input
              type="number"
              step={0.5}
              autoFocus
              placeholder="no sensor"
              value={editRoom.measured !== false && Number.isFinite(+editRoom.temp) ? editRoom.temp : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") updateRoom(editRoom.id, { measured: false });
                else {
                  const n = parseFloat(v);
                  if (Number.isFinite(n)) updateRoom(editRoom.id, { temp: n, measured: true });
                }
              }}
              onKeyDown={closeOnKey}
            />
            <span>°C</span>
          </div>
          <div className="temp-edit__row">
            <label>Target</label>
            <input
              type="number"
              step={0.5}
              placeholder={`${rawDoc.comfort}`}
              value={editRoom.target == null ? "" : editRoom.target}
              onChange={(e) =>
                updateRoom(editRoom.id, { target: e.target.value === "" ? null : parseFloat(e.target.value) })
              }
              onKeyDown={closeOnKey}
            />
            <span>°C</span>
          </div>
        </div>
      )}
      {editWin && editing && (
        <div ref={popRef} className="temp-edit" style={{ left: editing.left, top: editing.top }}>
          <div className="temp-edit__row">
            <label>Outside</label>
            <input
              type="number"
              step={0.5}
              autoFocus
              placeholder="forecast"
              value={editWin.temp == null ? "" : editWin.temp}
              onChange={(e) =>
                updateWindow(editWin.id, { temp: e.target.value === "" ? null : parseFloat(e.target.value) })
              }
              onKeyDown={closeOnKey}
            />
            <span>°C</span>
          </div>
          <div className="temp-edit__row">
            <label>Width</label>
            <input
              type="number"
              step={5}
              min={20}
              max={400}
              value={winWidthCm(editWin)}
              onChange={(e) => {
                const cm = parseFloat(e.target.value);
                if (Number.isFinite(cm)) updateWindow(editWin.id, { len: cmToLen(Math.max(20, Math.min(400, cm))) });
              }}
              onKeyDown={closeOnKey}
            />
            <span>cm</span>
          </div>
          <div className="temp-edit__row">
            <label>Opening</label>
            <select
              value={editWin.opening === "tilt" ? "tilt" : "full"}
              onChange={(e) => updateWindow(editWin.id, { opening: e.target.value === "tilt" ? "tilt" : "full" })}
              onKeyDown={closeOnKey}
            >
              <option value="full">Full</option>
              <option value="tilt">Kipp</option>
            </select>
          </div>
        </div>
      )}
    </>
  );
}
