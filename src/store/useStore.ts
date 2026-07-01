import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Doc, LatLon, Pt, Selection, Tool, Weather } from "../types";
import { uid } from "../lib/id";
import { nearestRoom, roomById, snapDoorPos, snapWindow, twoNearestRooms } from "../lib/geometry";
import { TEMPLATES, templateById } from "../lib/templates";
import { defaultDoc, markLoadedRoomsMeasured } from "../lib/doc";

const SKEY = "coolmicasa.v2";
const SKEY_V1 = "coolmicasa.v1";

function seedDoc(): Doc {
  const d = defaultDoc();
  const t = TEMPLATES[2].build(); // two-bedroom starter
  d.rooms = t.rooms;
  d.windows = t.windows;
  d.doors = t.doors;
  return markLoadedRoomsMeasured(d);
}

function loadDoc(): Doc {
  try {
    const raw = localStorage.getItem(SKEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.rooms) return markLoadedRoomsMeasured({ ...defaultDoc(), ...s });
    }
    const rawV1 = localStorage.getItem(SKEY_V1);
    if (rawV1) {
      const s = JSON.parse(rawV1);
      if (s && s.rooms) {
        const d: Doc = { ...defaultDoc(), ...s };
        delete (d as Doc & { fans?: unknown }).fans;
        return markLoadedRoomsMeasured(d);
      }
    }
  } catch {
    /* corrupt storage — fall through to seed */
  }
  return seedDoc();
}

function persist(doc: Doc) {
  try {
    localStorage.setItem(SKEY, JSON.stringify(doc));
  } catch {
    /* private mode / quota — ignore */
  }
}

/** Keep a room's doors glued to their shared walls after it moves/resizes. */
function resnapDoorsForRoom(doc: Doc, rid: string) {
  doc.doors.forEach((d) => {
    if (d.roomA === rid || d.roomB === rid) {
      const a = roomById(doc.rooms, d.roomA),
        b = roomById(doc.rooms, d.roomB);
      if (a && b) {
        const pos = snapDoorPos(a, b, { x: d.x, y: d.y });
        d.x = pos.x;
        d.y = pos.y;
      }
    }
  });
}

export interface AppState {
  doc: Doc;
  weather: Weather | null;
  weatherStatus: "idle" | "loading" | "ready" | "error";
  selection: Selection;
  tool: Tool;
  flashMsg: string;
  undoStack: string[];

  // ---- settings ----
  setComfort: (v: number) => void;
  setCeiling: (v: number) => void;
  setFanCount: (v: number) => void;
  setNorth: (v: number) => void;
  setPxPerM: (v: number) => void;
  setCanSealFan: (v: boolean) => void;
  setLocation: (loc: LatLon | null) => void;
  setWeather: (w: Weather | null, status: AppState["weatherStatus"]) => void;

  // ---- ui ----
  setTool: (t: Tool) => void;
  select: (sel: Selection) => void;
  flash: (msg: string) => void;

  // ---- editing ----
  updateRoom: (id: string, patch: Partial<Doc["rooms"][number]>) => void;
  updateWindow: (id: string, patch: Partial<Doc["windows"][number]>) => void;
  updateDoor: (id: string, patch: Partial<Doc["doors"][number]>) => void;
  toggleDoor: (id: string) => void;

  // ---- creation ----
  addRoomAt: (p: Pt) => string;
  addWindowAt: (p: Pt) => string | null;
  addDoorAt: (p: Pt) => { ok: boolean; msg?: string };

  // ---- live drag (no persist) ----
  dragRoomDraw: (id: string, x: number, y: number, w: number, h: number) => void;
  dragRoomMove: (id: string, x: number, y: number) => void;
  dragRoomResize: (id: string, w: number, h: number) => void;
  dragDoorMove: (id: string, p: Pt) => void;
  dragWindowSnap: (id: string, p: Pt) => void;
  endDrawRoom: (id: string) => void;
  commit: () => void;

  // ---- delete / undo / templates ----
  deleteItem: (sel: Selection) => void;
  pushUndo: () => void;
  undo: () => void;
  applyTemplate: (id: string) => void;
  loadLayout: (doc: Doc) => void;
  resetAll: () => void;
}

export const useStore = create<AppState>()(
  immer((set, get) => ({
    doc: loadDoc(),
    weather: null,
    weatherStatus: "idle",
    selection: null,
    tool: "select",
    flashMsg: "",
    undoStack: [],

    setComfort: (v) =>
      set((s) => {
        s.doc.comfort = v;
        persist(s.doc);
      }),
    setCeiling: (v) =>
      set((s) => {
        s.doc.ceilingH = v;
        persist(s.doc);
      }),
    setFanCount: (v) =>
      set((s) => {
        s.doc.fanCount = Math.max(0, Math.min(8, v));
        persist(s.doc);
      }),
    setNorth: (v) =>
      set((s) => {
        s.doc.northDeg = v;
        persist(s.doc);
      }),
    setPxPerM: (v) =>
      set((s) => {
        s.doc.pxPerM = Math.max(10, Math.min(200, v));
        persist(s.doc);
      }),
    setCanSealFan: (v) =>
      set((s) => {
        s.doc.canSealFan = v;
        persist(s.doc);
      }),
    setLocation: (loc) =>
      set((s) => {
        s.doc.location = loc;
        persist(s.doc);
      }),
    setWeather: (w, status) =>
      set((s) => {
        s.weather = w;
        s.weatherStatus = status;
      }),

    setTool: (t) =>
      set((s) => {
        s.tool = t;
      }),
    select: (sel) =>
      set((s) => {
        s.selection = sel;
      }),
    flash: (msg) =>
      set((s) => {
        s.flashMsg = msg;
      }),

    updateRoom: (id, patch) =>
      set((s) => {
        const r = roomById(s.doc.rooms, id);
        if (r) Object.assign(r, patch);
        persist(s.doc);
      }),
    updateWindow: (id, patch) =>
      set((s) => {
        const w = s.doc.windows.find((x) => x.id === id);
        if (w) Object.assign(w, patch);
        persist(s.doc);
      }),
    updateDoor: (id, patch) =>
      set((s) => {
        const d = s.doc.doors.find((x) => x.id === id);
        if (d) Object.assign(d, patch);
        persist(s.doc);
      }),
    toggleDoor: (id) =>
      set((s) => {
        const d = s.doc.doors.find((x) => x.id === id);
        if (d) d.open = !d.open;
        persist(s.doc);
      }),

    addRoomAt: (p) => {
      const id = uid();
      set((s) => {
        s.doc.rooms.push({
          id,
          name: "Room " + (s.doc.rooms.length + 1),
          x: p.x,
          y: p.y,
          w: 1,
          h: 1,
          temp: 26,
          measured: false, // assume no sensor until the user types a reading
        });
        s.selection = { type: "room", id };
      });
      return id;
    },
    addWindowAt: (p) => {
      const doc = get().doc;
      const r = doc.rooms.find((rm) => p.x >= rm.x && p.x <= rm.x + rm.w && p.y >= rm.y && p.y <= rm.y + rm.h) ||
        nearestRoom(doc.rooms, p);
      if (!r) return null;
      const id = uid();
      set((s) => {
        const room = roomById(s.doc.rooms, r.id)!;
        const w = { id, roomId: room.id, side: "N" as const, pos: 0.5, len: 80, shade: true, temp: null };
        snapWindow(w, room, p);
        s.doc.windows.push(w);
        s.selection = { type: "window", id };
        persist(s.doc);
      });
      return id;
    },
    addDoorAt: (p) => {
      const doc = get().doc;
      const [a, b] = twoNearestRooms(doc.rooms, p);
      if (!a || !b || a === b)
        return { ok: false, msg: "Draw at least two rooms first, then click the wall between two of them." };
      const existing = doc.doors.find(
        (d) => (d.roomA === a.id && d.roomB === b.id) || (d.roomA === b.id && d.roomB === a.id),
      );
      if (existing)
        return { ok: false, msg: `${a.name} and ${b.name} are already connected. Double-click a door to open/close it.` };
      const id = uid();
      set((s) => {
        const ra = roomById(s.doc.rooms, a.id)!,
          rb = roomById(s.doc.rooms, b.id)!;
        const pos = snapDoorPos(ra, rb, p);
        s.doc.doors.push({ id, roomA: ra.id, roomB: rb.id, x: pos.x, y: pos.y, open: true });
        s.selection = { type: "door", id };
        persist(s.doc);
      });
      return { ok: true, msg: `Doorway added: ${a.name} ↔ ${b.name} (OPEN). Drag it onto the real opening; double-click to shut.` };
    },

    dragRoomDraw: (id, x, y, w, h) =>
      set((s) => {
        const r = roomById(s.doc.rooms, id);
        if (r) {
          r.x = x;
          r.y = y;
          r.w = w;
          r.h = h;
        }
      }),
    dragRoomMove: (id, x, y) =>
      set((s) => {
        const r = roomById(s.doc.rooms, id);
        if (r) {
          r.x = x;
          r.y = y;
          resnapDoorsForRoom(s.doc, id);
        }
      }),
    dragRoomResize: (id, w, h) =>
      set((s) => {
        const r = roomById(s.doc.rooms, id);
        if (r) {
          r.w = Math.max(40, w);
          r.h = Math.max(40, h);
          resnapDoorsForRoom(s.doc, id);
        }
      }),
    dragDoorMove: (id, p) =>
      set((s) => {
        const d = s.doc.doors.find((x) => x.id === id);
        if (!d) return;
        const a = roomById(s.doc.rooms, d.roomA),
          b = roomById(s.doc.rooms, d.roomB);
        const pos = snapDoorPos(a, b, p);
        d.x = pos.x;
        d.y = pos.y;
      }),
    dragWindowSnap: (id, p) =>
      set((s) => {
        const w = s.doc.windows.find((x) => x.id === id);
        if (!w) return;
        const r = roomById(s.doc.rooms, w.roomId);
        if (r) snapWindow(w, r, p);
      }),
    endDrawRoom: (id) =>
      set((s) => {
        const r = roomById(s.doc.rooms, id);
        if (r && (r.w < 30 || r.h < 30)) {
          r.w = Math.max(r.w, 120);
          r.h = Math.max(r.h, 90);
        }
        persist(s.doc);
      }),
    commit: () =>
      set((s) => {
        persist(s.doc);
      }),

    pushUndo: () =>
      set((s) => {
        s.undoStack.push(JSON.stringify(s.doc));
        if (s.undoStack.length > 40) s.undoStack.shift();
      }),
    undo: () =>
      set((s) => {
        const snap = s.undoStack.pop();
        if (!snap) {
          s.flashMsg = "Nothing to undo.";
          return;
        }
        s.doc = JSON.parse(snap);
        s.selection = null;
        s.flashMsg = "Undone.";
        persist(s.doc);
      }),
    deleteItem: (sel) => {
      if (!sel) return;
      set((s) => {
        s.undoStack.push(JSON.stringify(s.doc));
        if (s.undoStack.length > 40) s.undoStack.shift();
        if (sel.type === "room") {
          s.doc.rooms = s.doc.rooms.filter((r) => r.id !== sel.id);
          s.doc.windows = s.doc.windows.filter((w) => w.roomId !== sel.id);
          s.doc.doors = s.doc.doors.filter((d) => d.roomA !== sel.id && d.roomB !== sel.id);
        } else if (sel.type === "window") {
          s.doc.windows = s.doc.windows.filter((w) => w.id !== sel.id);
        } else if (sel.type === "door") {
          s.doc.doors = s.doc.doors.filter((d) => d.id !== sel.id);
        }
        if (s.selection && s.selection.id === sel.id) s.selection = null;
        s.flashMsg = "Deleted — press Ctrl+Z to undo.";
        persist(s.doc);
      });
    },
    applyTemplate: (id) => {
      const t = templateById(id);
      if (!t) return;
      set((s) => {
        s.undoStack.push(JSON.stringify(s.doc));
        const data = t.build();
        data.rooms.forEach((r) => {
          if (r.measured === undefined) r.measured = true;
        });
        s.doc.rooms = data.rooms;
        s.doc.windows = data.windows;
        s.doc.doors = data.doors;
        s.selection = null;
        s.flashMsg = `Loaded the “${t.name}” template — drag rooms to match your flat.`;
        persist(s.doc);
      });
    },
    loadLayout: (doc) =>
      set((s) => {
        s.undoStack.push(JSON.stringify(s.doc));
        if (s.undoStack.length > 40) s.undoStack.shift();
        s.doc = doc;
        s.selection = null;
        s.flashMsg = "Layout loaded — press Ctrl+Z to undo.";
        persist(s.doc);
      }),
    resetAll: () =>
      set((s) => {
        s.doc = seedDoc();
        s.selection = null;
        s.weather = null;
        s.weatherStatus = "idle";
        s.undoStack = [];
        persist(s.doc);
      }),
  })),
);
