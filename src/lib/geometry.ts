import type { Door, Pt, Room, Side, WindowItem } from "../types";

/**
 * Fixed canvas pixels per real-world metre. Room geometry is stored in canvas px;
 * this is the single conversion to metres. On-screen size is controlled by the
 * view zoom (a pure display transform), never by changing this ratio.
 */
export const PX_PER_M = 50;

export const SIDE_OFFSET: Record<Side, number> = { N: 0, E: 90, S: 180, W: 270 };
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function compassName(deg: number): string {
  return COMPASS[Math.round(((((deg % 360) + 360) % 360) / 45)) % 8];
}

/** Absolute angular difference between two bearings, 0..180. */
export function angDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** The real compass bearing a window faces, given the flat's north rotation. */
export function windowFacing(win: WindowItem, northDeg: number): number {
  return (((northDeg + SIDE_OFFSET[win.side]) % 360) + 360) % 360;
}

export function roomById(rooms: Room[], rid: string): Room | undefined {
  return rooms.find((r) => r.id === rid);
}

/** Outward-facing endpoints of a window segment on its room wall. */
export function windowSegment(win: WindowItem, rooms: Room[]) {
  const r = roomById(rooms, win.roomId);
  if (!r) return null;
  const half = win.len / 2;
  if (win.side === "N") {
    const cx = r.x + win.pos * r.w;
    return { x1: cx - half, y1: r.y, x2: cx + half, y2: r.y };
  }
  if (win.side === "S") {
    const cx = r.x + win.pos * r.w;
    return { x1: cx - half, y1: r.y + r.h, x2: cx + half, y2: r.y + r.h };
  }
  if (win.side === "W") {
    const cy = r.y + win.pos * r.h;
    return { x1: r.x, y1: cy - half, x2: r.x, y2: cy + half };
  }
  const cy = r.y + win.pos * r.h;
  return { x1: r.x + r.w, y1: cy - half, x2: r.x + r.w, y2: cy + half };
}

export function windowMid(win: WindowItem, rooms: Room[]): Pt | null {
  const s = windowSegment(win, rooms);
  return s ? { x: (s.x1 + s.x2) / 2, y: (s.y1 + s.y2) / 2 } : null;
}

// Vertical geometry (metres above floor). Defaults keep old saved windows working.
export function winSill(w: WindowItem): number {
  return w.sill != null ? +w.sill : 0.9;
}
export function winHeight(w: WindowItem): number {
  return w.winH != null ? +w.winH : 1.1;
}
export function winTop(w: WindowItem, ceilingH: number): number {
  return Math.min(winSill(w) + winHeight(w), ceilingH || 2.5);
}
/** px·m proxy for the glazed opening size (ignores how far the window is opened). */
export function winArea(w: WindowItem): number {
  return w.len * winHeight(w);
}

/** Window width along the wall, in centimetres (stored as canvas px). */
export function winWidthCm(w: WindowItem): number {
  return Math.round((w.len / PX_PER_M) * 100);
}
/** Convert a width in centimetres to the canvas-px `len` used in geometry. */
export function cmToLen(cm: number): number {
  return (Math.max(0, cm) / 100) * PX_PER_M;
}

/**
 * Fraction of the glazed opening actually free for airflow given how it's opened.
 * A *gekippt* (tilt) window cracks a small wedge at the top — realistically only a
 * fraction of a fully-open sash — so it ventilates far less for the same glass.
 */
export function openingFactor(w: WindowItem): number {
  return w.opening === "tilt" ? 0.2 : 1;
}
/** Effective free opening area (px·m proxy) for airflow, discounting tilt-only windows. */
export function openArea(w: WindowItem): number {
  return winArea(w) * openingFactor(w);
}

export function roomCenter(r: Room): Pt {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function outwardVec(side: Side): Pt {
  return { N: { x: 0, y: -1 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 }, E: { x: 1, y: 0 } }[side];
}

/** Shortest distance from point p to a room rectangle (0 if inside). */
export function rectDist(r: Room, p: Pt): number {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

/** The two nearest rooms to a click, for placing a door between them. */
export function twoNearestRooms(rooms: Room[], p: Pt): [Room | undefined, Room | undefined] {
  const ranked = rooms.map((r) => ({ r, d: rectDist(r, p) })).sort((a, b) => a.d - b.d);
  return [ranked[0]?.r, ranked[1]?.r];
}

export function doorById(doors: Door[], did: string): Door | undefined {
  return doors.find((d) => d.id === did);
}

export function doorBetween(doors: Door[], a: string, b: string): Door | undefined {
  return doors.find((d) => (d.roomA === a && d.roomB === b) || (d.roomA === b && d.roomB === a));
}

interface Wall {
  vertical: boolean;
  coord: number;
  lo: number;
  hi: number;
}

/** The wall two rooms share: its axis, coordinate, and the valid span (lo..hi). */
export function sharedWall(a: Room, b: Room): Wall {
  const ax2 = a.x + a.w,
    ay2 = a.y + a.h,
    bx2 = b.x + b.w,
    by2 = b.y + b.h;
  const sepX = Math.max(b.x - ax2, a.x - bx2);
  const sepY = Math.max(b.y - ay2, a.y - by2);
  if (sepX >= sepY) {
    return {
      vertical: true,
      coord: (a.x < b.x ? ax2 + b.x : bx2 + a.x) / 2,
      lo: Math.max(a.y, b.y),
      hi: Math.min(ay2, by2),
    };
  }
  return {
    vertical: false,
    coord: (a.y < b.y ? ay2 + b.y : by2 + a.y) / 2,
    lo: Math.max(a.x, b.x),
    hi: Math.min(ax2, bx2),
  };
}

/** Snap a click/drag point onto the shared wall, clamped to the opening span. */
export function snapDoorPos(a: Room | undefined, b: Room | undefined, p: Pt): Pt {
  if (!a || !b) return { x: p.x, y: p.y };
  const w = sharedWall(a, b);
  if (w.hi - w.lo > 6) {
    const m = Math.min(14, (w.hi - w.lo) / 2 - 1);
    if (w.vertical) return { x: w.coord, y: Math.max(w.lo + m, Math.min(p.y, w.hi - m)) };
    return { x: Math.max(w.lo + m, Math.min(p.x, w.hi - m)), y: w.coord };
  }
  // rooms don't overlap on that axis (diagonal) -> midpoint of nearest points
  const nax = Math.max(a.x, Math.min(p.x, a.x + a.w)),
    nay = Math.max(a.y, Math.min(p.y, a.y + a.h));
  const nbx = Math.max(b.x, Math.min(p.x, b.x + b.w)),
    nby = Math.max(b.y, Math.min(p.y, b.y + b.h));
  return { x: (nax + nbx) / 2, y: (nay + nby) / 2 };
}

export function doorWallVertical(d: Door, rooms: Room[]): boolean {
  const a = roomById(rooms, d.roomA),
    b = roomById(rooms, d.roomB);
  if (!a || !b) return true;
  return sharedWall(a, b).vertical;
}

export function nearestRoom(rooms: Room[], p: Pt): Room | null {
  let best: Room | null = null,
    bd = 1e9;
  for (const r of rooms) {
    const cx = Math.max(r.x, Math.min(p.x, r.x + r.w)),
      cy = Math.max(r.y, Math.min(p.y, r.y + r.h));
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d < bd) {
      bd = d;
      best = r;
    }
  }
  return best;
}

export function clamp01(v: number): number {
  return Math.max(0.08, Math.min(0.92, v));
}

/** Mutates a window's side/pos to snap it to the nearest wall of room r at point p. */
export function snapWindow(w: WindowItem, r: Room, p: Pt): void {
  const dT = Math.abs(p.y - r.y),
    dB = Math.abs(p.y - (r.y + r.h)),
    dL = Math.abs(p.x - r.x),
    dR = Math.abs(p.x - (r.x + r.w));
  const m = Math.min(dT, dB, dL, dR);
  if (m === dT) {
    w.side = "N";
    w.pos = clamp01((p.x - r.x) / r.w);
  } else if (m === dB) {
    w.side = "S";
    w.pos = clamp01((p.x - r.x) / r.w);
  } else if (m === dL) {
    w.side = "W";
    w.pos = clamp01((p.y - r.y) / r.h);
  } else {
    w.side = "E";
    w.pos = clamp01((p.y - r.y) / r.h);
  }
}
