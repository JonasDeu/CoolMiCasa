import { useEffect, useRef } from "react";
import type { AirflowResult } from "../../lib/airflow";
import type { FanSpot } from "../../lib/fanPlan";
import type { Door, Pt, Room, WindowItem } from "../../types";
import { roomById, windowMid } from "../../lib/geometry";
import { useStore } from "../../store/useStore";
import { drawScene } from "./draw";

const CW = 900;
const CH = 620;

interface Props {
  air: AirflowResult | null;
  fanSpots: FanSpot[];
}

type Drag =
  | { mode: "draw"; id: string; sx: number; sy: number }
  | { mode: "move"; id: string; dx: number; dy: number }
  | { mode: "resize"; id: string }
  | { mode: "door"; id: string }
  | { mode: "win"; id: string }
  | null;

export function FloorPlanCanvas({ air, fanSpots }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<Drag>(null);

  const doc = useStore((s) => s.doc);
  const weather = useStore((s) => s.weather);
  const selection = useStore((s) => s.selection);

  // redraw whenever anything visible changes
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    drawScene(ctx, { width: CW, height: CH, doc, weather, air, fanSpots, selection });
  }, [doc, weather, air, fanSpots, selection]);

  function toCanvas(ev: React.PointerEvent | React.MouseEvent): Pt {
    const cv = canvasRef.current!;
    const r = cv.getBoundingClientRect();
    return {
      x: ((ev.clientX - r.left) * CW) / r.width,
      y: ((ev.clientY - r.top) * CH) / r.height,
    };
  }

  function hitWindow(p: Pt): WindowItem | null {
    for (const w of doc.windows) {
      const m = windowMid(w, doc.rooms);
      if (m && Math.hypot(p.x - m.x, p.y - m.y) < 14) return w;
    }
    return null;
  }
  function hitDoor(p: Pt): Door | null {
    for (const d of doc.doors) if (Math.hypot(p.x - d.x, p.y - d.y) < 13) return d;
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

  function onPointerDown(ev: React.PointerEvent) {
    const s = useStore.getState();
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
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
    s.select(null);
  }

  function onPointerMove(ev: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
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
    const s = useStore.getState();
    if (drag.mode === "draw") s.endDrawRoom(drag.id);
    else s.commit();
    dragRef.current = null;
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

  return (
    <canvas
      ref={canvasRef}
      className="floorplan-canvas"
      width={CW}
      height={CH}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    />
  );
}
