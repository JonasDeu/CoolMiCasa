import type { AirflowResult } from "../../lib/airflow";
import type { FanSpot } from "../../lib/fanPlan";
import type { OpeningsPlan } from "../../lib/openings";
import type { Doc, Pt, Selection, Weather } from "../../types";
import {
  compassName,
  doorWallVertical,
  outwardVec,
  PX_PER_M,
  roomById,
  windowFacing,
  windowMid,
  windowSegment,
} from "../../lib/geometry";
import { maxIndoor, nowHour, roomTarget, sunOnWindow, ventilate } from "../../lib/recommend";
import { dewPointC, MUGGY_DEW } from "../../lib/humidity";
import type { RoomTempMap } from "../../lib/temps";

const COLORS = {
  grid: "#152234",
  roomFill: "rgba(40,62,86,.55)",
  roomStroke: "#3a5675",
  sel: "#5ec6ff",
  accent: "#5ec6ff",
  good: "#37d39a",
  warn: "#ffb03a",
  bad: "#ff6b5e",
  sun: "#ffd34d",
  shade: "#9b8cff",
  flowIn: "#7fd0ff",
  flowOut: "#ffb27a",
  textBright: "#dfeaf5",
  textMuted: "#9fb4c9",
};

export interface DrawOpts {
  width: number;
  height: number;
  /** Pan offset in canvas px — the whole scene is translated by this. */
  view: Pt;
  /** View zoom factor — a pure display scale applied after the pan translate. */
  zoom: number;
  doc: Doc;
  weather: Weather | null;
  air: AirflowResult | null;
  /** Per-window sash/blind and per-door open/close verdicts. */
  openings: OpeningsPlan;
  fanSpots: FanSpot[];
  selection: Selection;
  temps: RoomTempMap;
  /** Animation clock, ms (performance.now()) — drives the flowing dashes. */
  now: number;
}

/** The map grid — drawn in viewport space but scrolled with the pan offset and scaled by zoom. */
function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, view: Pt, zoom: number) {
  const G = 30 * zoom;
  const ox = ((view.x % G) + G) % G;
  const oy = ((view.y % G) + G) % G;
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let x = ox; x < width; x += G) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = oy; y < height; y += G) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, o: DrawOpts) {
  const { width, height, view, zoom, doc, weather, air, openings, fanSpots, selection, temps, now } = o;
  const h = nowHour(weather);
  ctx.clearRect(0, 0, width, height);

  drawGrid(ctx, width, height, view, zoom);

  // everything below is in map coordinates: it pans with the view and scales with the zoom
  ctx.save();
  ctx.translate(view.x, view.y);
  ctx.scale(zoom, zoom);

  // rooms
  for (const r of doc.rooms) {
    const seld = selection?.type === "room" && selection.id === r.id;
    ctx.fillStyle = COLORS.roomFill;
    ctx.strokeStyle = seld ? COLORS.sel : COLORS.roomStroke;
    ctx.lineWidth = seld ? 3 : 2;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    if (r.priority) {
      ctx.save();
      ctx.strokeStyle = COLORS.sun;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
      ctx.restore();
    }
    if (air && air.active) {
      const f = air.roomFlow[r.id] ?? 0;
      if (f > 0.02) {
        // tint depth tracks how much of the breeze actually serves this room
        ctx.fillStyle = `rgba(94,198,255,${(0.05 + 0.15 * Math.min(1, f)).toFixed(3)})`;
        ctx.fillRect(r.x, r.y, r.w, r.h);
      } else if (air.stagnant.has(r.id)) {
        ctx.fillStyle = "rgba(255,176,58,.10)";
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    }
    ctx.fillStyle = COLORS.textBright;
    ctx.font = "600 13px system-ui";
    ctx.fillText((r.priority ? "⭐ " : "") + r.name, r.x + 8, r.y + 18);

    // dimensions in metres (top-right of the room)
    if (r.w > 70) {
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = "10px system-ui";
      ctx.textAlign = "right";
      ctx.fillText(`${(r.w / PX_PER_M).toFixed(1)}×${(r.h / PX_PER_M).toFixed(1)} m`, r.x + r.w - 6, r.y + 15);
      ctx.textAlign = "start";
    }

    const t = +r.temp;
    const target = roomTarget(doc, r);
    const est = temps[r.id]?.estimated;
    ctx.fillStyle = t >= target ? "#ff9d8f" : "#7fe0bd";
    ctx.font = "700 16px system-ui";
    const tlabel = (isFinite(t) ? (est ? "~" : "") + t.toFixed(1) : "—") + "°";
    ctx.fillText(tlabel, r.x + 8, r.y + 38);
    if (est && isFinite(t)) {
      const wpx = ctx.measureText(tlabel).width;
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = "italic 10px system-ui";
      ctx.fillText("est.", r.x + 13 + wpx, r.y + 37);
    }

    // target temperature (double-click the room to change it)
    if (r.h > 66) {
      const custom = r.target != null;
      ctx.fillStyle = custom ? "#bcd0e6" : COLORS.textMuted;
      ctx.font = (custom ? "700 " : "600 ") + "11px system-ui";
      ctx.fillText(`🎯 ${target}°`, r.x + 8, r.y + 55);
    }

    // humidity: a measured hygrometer reading, or (softly) a borrowed estimate, plus
    // an optional per-room ceiling. Estimates get the same ~/est. treatment as temps.
    if (r.rh != null && Number.isFinite(+r.rh) && r.h > 84) {
      const rh = +r.rh;
      const rhEst = temps[r.id]?.rhEstimated;
      const rhTarget = r.rhTarget != null ? +r.rhTarget : null;
      ctx.fillStyle = rhEst
        ? COLORS.textMuted
        : rhTarget != null
          ? rh > rhTarget
            ? "#ff9d8f"
            : "#7fe0bd"
          : dewPointC(t, rh) >= MUGGY_DEW
            ? COLORS.warn
            : COLORS.textMuted;
      ctx.font = "700 12px system-ui";
      const rhLabel = `${rhEst ? "~" : ""}💧 ${Math.round(rh)}%`;
      ctx.fillText(rhLabel, r.x + 8, r.y + 72);
      let after = r.x + 8 + ctx.measureText(rhLabel).width + 6;
      if (rhEst) {
        ctx.fillStyle = COLORS.textMuted;
        ctx.font = "italic 10px system-ui";
        ctx.fillText("est.", after, r.y + 71);
        after += ctx.measureText("est.").width + 6;
      }
      if (rhTarget != null) {
        ctx.fillStyle = COLORS.textMuted;
        ctx.font = "600 11px system-ui";
        ctx.fillText(`🎯 ${Math.round(rhTarget)}%`, after, r.y + 71);
      }
    }

    if (air && air.active) {
      const tag = air.flowRooms.has(r.id)
        ? "✓ cross-flow"
        : air.singleRooms.has(r.id)
          ? "~ one-sided"
          : air.stagnant.has(r.id)
            ? "⚠ stagnant"
            : "";
      if (tag) {
        ctx.fillStyle = COLORS.textMuted;
        ctx.font = "11px system-ui";
        ctx.fillText(tag, r.x + 8, r.y + r.h - 9);
      }
    }
    if (seld) {
      ctx.fillStyle = COLORS.sel;
      ctx.fillRect(r.x + r.w - 7, r.y + r.h - 7, 12, 12);
    }
  }

  // windows
  for (const w of doc.windows) {
    const seg = windowSegment(w, doc.rooms);
    if (!seg) continue;
    let color = COLORS.shade;
    if (h) {
      const r = roomById(doc.rooms, w.roomId);
      const indoorT = r ? +r.temp : maxIndoor(doc.rooms);
      const target = r ? roomTarget(doc, r) : +doc.comfort;
      const outdoorT = w.temp != null ? +w.temp : h.temp;
      const sunHit = sunOnWindow(w, h.sun, doc.northDeg) && h.rad > 120;
      if (sunHit) color = COLORS.sun;
      else if (ventilate(outdoorT, indoorT, target)) color = COLORS.good;
      else color = COLORS.warn;
    }
    // tilt-only (gekippt) windows draw dashed to signal they only crack open a little
    const tilt = w.opening === "tilt";
    ctx.strokeStyle = color;
    ctx.lineWidth = tilt ? 5 : 7;
    ctx.lineCap = "round";
    if (tilt) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (selection?.type === "window" && selection.id === w.id) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
    }
    const m = windowMid(w, doc.rooms)!;
    const facing = compassName(windowFacing(w, doc.northDeg));
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = "10px system-ui";
    ctx.fillText(facing, m.x - 6, m.y - 9);
    if (tilt) {
      ctx.fillStyle = COLORS.sun;
      ctx.font = "700 9px system-ui";
      ctx.fillText("kipp", m.x - 6 + ctx.measureText(facing).width + 4, m.y - 9);
    }

    // outdoor temp: a manually-set value (bright blue), else the live forecast (muted);
    // dash only when there's no forecast either. Double-click a window to override it.
    const v = outwardVec(w.side);
    const tx = m.x + v.x * 18 - 8,
      ty = m.y + v.y * 18 + 4;
    if (w.temp != null) {
      ctx.fillStyle = "#7fd0ff";
      ctx.font = "700 11px system-ui";
      ctx.fillText(w.temp + "°", tx, ty);
    } else {
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = "600 11px system-ui";
      ctx.fillText(h ? Math.round(h.temp) + "°" : "—°", tx, ty);
    }

    // explicit verdict: OPEN / CLOSE / SHADE badge, plus a blind bar while it should be down
    const ov = openings.windows[w.id];
    if (ov) {
      if (ov.blind === "down") {
        ctx.strokeStyle = COLORS.shade;
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(seg.x1 + v.x * 7, seg.y1 + v.y * 7);
        ctx.lineTo(seg.x2 + v.x * 7, seg.y2 + v.y * 7);
        ctx.stroke();
      }
      const label = ov.sash === "open" ? "OPEN" : ov.sunHit ? "SHADE" : "CLOSE";
      const col = ov.sash === "open" ? COLORS.good : ov.sunHit ? COLORS.sun : COLORS.warn;
      // sit clear of the temp label: further out on the wall normal, dropped a little on E/W walls
      const bx = m.x + v.x * 34,
        by = m.y + v.y * 34 + (v.y === 0 ? 15 : 0);
      badge(ctx, bx, by, label, col);
      if (ov.noShade) {
        ctx.fillStyle = COLORS.warn;
        ctx.font = "700 9px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("⚠ no blind", bx, by + 17);
        ctx.textAlign = "start";
      }
    }
  }

  drawAirflow(ctx, air, now);
  drawWindowFlows(ctx, doc, air);
  drawDoors(ctx, doc, air, openings, selection, now);
  drawFans(ctx, fanSpots, doc.fanCount || 0, now);

  ctx.restore();

  // viewport-pinned overlays (never pan or zoom)
  drawCompass(ctx, doc.northDeg, width);
  drawSun(ctx, doc.northDeg, h, width);
  // the bar reflects the on-screen scale, so it tracks the zoom
  drawScaleBar(ctx, PX_PER_M * zoom, width, height);
}

/** Pick a round number of metres (1/2/5 × 10ⁿ) whose bar is ≈ targetPx wide. */
function niceMeters(targetPx: number, pxPerM: number): number {
  const rawM = targetPx / pxPerM;
  const pow = Math.pow(10, Math.floor(Math.log10(rawM)));
  let m = pow;
  for (const c of [1, 2, 5, 10]) if (c * pow <= rawM) m = c * pow;
  return m;
}

function drawScaleBar(ctx: CanvasRenderingContext2D, pxPerM: number, width: number, height: number) {
  if (!(pxPerM > 0)) return;
  const m = niceMeters(130, pxPerM);
  const barPx = m * pxPerM;
  const x2 = width - 22,
    x1 = x2 - barPx,
    y = height - 24;
  ctx.save();
  // legibility backing
  ctx.fillStyle = "rgba(11,18,25,.7)";
  ctx.fillRect(x1 - 10, y - 22, barPx + 20, 32);
  ctx.strokeStyle = "#cfe0f0";
  ctx.fillStyle = "#cfe0f0";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.moveTo(x1, y - 5);
  ctx.lineTo(x1, y + 5);
  ctx.moveTo(x2, y - 5);
  ctx.lineTo(x2, y + 5);
  ctx.stroke();
  ctx.font = "700 11px system-ui";
  ctx.textAlign = "center";
  ctx.fillText(`${m} m`, (x1 + x2) / 2, y - 8);
  ctx.textAlign = "start";
  ctx.restore();
}

/** Small rounded chip with colored text on a dark backing — the canvas twin of the UI pill. */
function badge(ctx: CanvasRenderingContext2D, cx: number, cy: number, text: string, col: string) {
  ctx.save();
  ctx.font = "700 9px system-ui";
  const w = ctx.measureText(text).width + 10,
    h = 14,
    r = 4;
  const x = cx - w / 2,
    y = cy - h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = "rgba(11,18,25,.85)";
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cx, cy + 0.5);
  ctx.restore();
}

function arrowHead(ctx: CanvasRenderingContext2D, a: Pt, b: Pt) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x),
    s = 8;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - Math.cos(ang - 0.4) * s, b.y - Math.sin(ang - 0.4) * s);
  ctx.lineTo(b.x - Math.cos(ang + 0.4) * s, b.y - Math.sin(ang + 0.4) * s);
  ctx.closePath();
  ctx.fill();
}

/** Breeze paths — dash crawl speed, width and opacity all scale with the path's flow share. */
function drawAirflow(ctx: CanvasRenderingContext2D, air: AirflowResult | null, now: number) {
  if (!air || !air.active) return;
  ctx.save();
  ctx.lineCap = "round";
  for (const path of air.paths) {
    const pts = (path.pts || []).filter(Boolean) as Pt[];
    if (pts.length < 2) continue;
    const s = Math.max(0.12, Math.min(1, path.strength));
    const dash = 7 + 6 * s;
    ctx.strokeStyle = `rgba(94,198,255,${(0.3 + 0.5 * s).toFixed(2)})`;
    ctx.fillStyle = `rgba(94,198,255,${(0.45 + 0.45 * s).toFixed(2)})`;
    ctx.lineWidth = 2 + 3 * s;
    ctx.setLineDash([dash, dash]);
    ctx.lineDashOffset = -(((now / 1000) * (18 + 70 * s)) % (dash * 2));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 1; i < pts.length; i++) arrowHead(ctx, pts[i - 1], pts[i]);
  }
  ctx.restore();
}

/** In/out arrows at each open window — cool blue flowing in, warm amber flowing out. */
function drawWindowFlows(ctx: CanvasRenderingContext2D, doc: Doc, air: AirflowResult | null) {
  if (!air || !air.active) return;
  ctx.save();
  ctx.lineCap = "round";
  for (const wf of air.flows) {
    if (wf.strength < 0.03) continue;
    const m = windowMid(wf.win, doc.rooms);
    if (!m) continue;
    const v = outwardVec(wf.win.side);
    const s = wf.strength;
    const len = 15 + 17 * s;
    const isIn = wf.role === "intake";
    const col = isIn ? COLORS.flowIn : COLORS.flowOut;
    const from = isIn
      ? { x: m.x + v.x * len * 0.75, y: m.y + v.y * len * 0.75 }
      : { x: m.x - v.x * len * 0.45, y: m.y - v.y * len * 0.45 };
    const to = isIn
      ? { x: m.x - v.x * len * 0.55, y: m.y - v.y * len * 0.55 }
      : { x: m.x + v.x * len * 0.9, y: m.y + v.y * len * 0.9 };
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 2 + 2.5 * s;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    arrowHead(ctx, from, to);
  }
  ctx.restore();
}

function drawDoors(
  ctx: CanvasRenderingContext2D,
  doc: Doc,
  air: AirflowResult | null,
  openings: OpeningsPlan,
  selection: Selection,
  now: number,
) {
  const tick = (x: number, y: number, dx: number, dy: number) => {
    ctx.beginPath();
    ctx.moveTo(x - dx, y - dy);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();
  };
  for (const d of doc.doors) {
    const seld = selection?.type === "door" && selection.id === d.id;
    let onPath = false;
    if (air)
      for (const p of air.paths) {
        for (let i = 0; i < p.roomPath.length - 1; i++) {
          const a = p.roomPath[i],
            b = p.roomPath[i + 1];
          if ((a === d.roomA && b === d.roomB) || (a === d.roomB && b === d.roomA)) {
            onPath = true;
            break;
          }
        }
        if (onPath) break;
      }
    // In a net of rooms the breeze isn't limited to one drawn path — any open door
    // linking two cross-flow rooms carries part of it, so highlight those too.
    if (!onPath && air && air.active && d.open && air.flowRooms.has(d.roomA) && air.flowRooms.has(d.roomB))
      onPath = true;
    const vert = doorWallVertical(d, doc.rooms),
      half = 15;
    let x1, y1, x2, y2;
    if (vert) {
      x1 = x2 = d.x;
      y1 = d.y - half;
      y2 = d.y + half;
    } else {
      y1 = y2 = d.y;
      x1 = d.x - half;
      x2 = d.x + half;
    }
    ctx.save();
    ctx.lineCap = "round";
    if (seld) {
      ctx.strokeStyle = "rgba(255,255,255,.85)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(d.x, d.y, half + 5, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (d.open) {
      const col = onPath ? COLORS.accent : COLORS.good;
      ctx.strokeStyle = col;
      ctx.lineWidth = 4;
      if (vert) {
        tick(x1, y1, 8, 0);
        tick(x2, y2, 8, 0);
      } else {
        tick(x1, y1, 0, 8);
        tick(x2, y2, 0, 8);
      }
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (vert) {
        ctx.moveTo(d.x, y1);
        ctx.lineTo(d.x + 13, y1 + 13);
      } else {
        ctx.moveTo(x1, d.y);
        ctx.lineTo(x1 + 13, d.y + 13);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      if (vert) ctx.arc(d.x, y1, 18, 0, Math.PI / 2);
      else ctx.arc(x1, d.y, 18, 0, Math.PI / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = COLORS.bad;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    // state label, plus the verdict: ✓ when the state matches the advice,
    // a pulsing ring + "→ OPEN / → SHUT" hint when the user should flip it.
    const dv = openings.doors[d.id];
    const ok = dv?.want != null && !dv.change;
    ctx.fillStyle = d.open ? (onPath ? "#9fe0ff" : "#7fe0bd") : "#ff9d8f";
    ctx.font = "700 9px system-ui";
    ctx.textAlign = "center";
    ctx.fillText((d.open ? "OPEN" : "SHUT") + (ok ? " ✓" : ""), d.x, vert ? y2 + 13 : y1 - 7);
    if (dv?.change) {
      const col = dv.want === "open" ? COLORS.good : COLORS.bad;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.45 + 0.35 * Math.sin(now / 260);
      ctx.beginPath();
      ctx.arc(d.x, d.y, half + 9, 0, 7);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.fillText(dv.want === "open" ? "→ OPEN" : "→ SHUT", d.x, vert ? y2 + 24 : y1 - 18);
    }
    ctx.textAlign = "start";
    ctx.restore();
  }
}

/** Fan spots: jet cone showing throw and direction, animated centerline, number badge. */
function drawFans(ctx: CanvasRenderingContext2D, spots: FanSpot[], owned: number, now: number) {
  spots.forEach((f, idx) => {
    const have = idx < owned;
    const col = have ? "#7ee0ff" : "#5a6b7d";
    const b = Math.max(0.15, Math.min(1, f.benefit));
    ctx.save();
    ctx.globalAlpha = have ? 1 : 0.55;

    // translucent jet wedge — length/width scale with the spot's usefulness
    const L = 36 + 30 * b;
    const px = -f.dir.y,
      py = f.dir.x;
    const half = L * 0.26;
    const ax = f.x + f.dir.x * 10,
      ay = f.y + f.dir.y * 10;
    const bx = f.x + f.dir.x * L,
      by = f.y + f.dir.y * L;
    ctx.fillStyle = have ? "rgba(126,224,255,.14)" : "rgba(90,107,125,.12)";
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx + px * half, by + py * half);
    ctx.lineTo(bx - px * half, by - py * half);
    ctx.closePath();
    ctx.fill();

    // animated centerline
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.setLineDash([5, 6]);
    ctx.lineDashOffset = -(((now / 1000) * (30 + 50 * b)) % 11);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = col;
    arrowHead(ctx, { x: ax, y: ay }, { x: bx, y: by });

    // fan body
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 14, 0, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "16px system-ui";
    ctx.fillText("🌀", f.x - 9, f.y + 6);

    // number badge + height chip
    ctx.fillStyle = have ? "#04263a" : "#0b1219";
    ctx.beginPath();
    ctx.arc(f.x + 12, f.y - 12, 8, 0, 7);
    ctx.fill();
    ctx.fillStyle = col;
    ctx.font = "700 11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(String(idx + 1), f.x + 12, f.y - 8);
    ctx.textAlign = "start";
    ctx.fillStyle = have ? "#cde6ff" : "#8aa0b6";
    ctx.font = "700 10px system-ui";
    ctx.fillText("↕ " + f.heightM.toFixed(1) + " m", f.x - 18, f.y - 21);
    ctx.restore();
  });
}

/** Screen-space unit vector for a real compass bearing, given the flat's north rotation. */
function bearingVec(deg: number, northDeg: number): Pt {
  const a = (deg - northDeg) * Math.PI / 180;
  return { x: Math.sin(a), y: -Math.cos(a) };
}

function drawCompass(ctx: CanvasRenderingContext2D, northDeg: number, width: number) {
  const cx = width - 56,
    cy = 56,
    R = 26;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = "rgba(11,18,25,.85)";
  ctx.strokeStyle = "#2a3a4d";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, R + 14, 0, 7);
  ctx.fill();
  ctx.stroke();
  const N = bearingVec(0, northDeg);
  ctx.strokeStyle = "#3a5675";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-N.x * R, -N.y * R);
  ctx.stroke();
  ctx.strokeStyle = COLORS.bad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(N.x * R, N.y * R);
  ctx.stroke();
  const p = { x: -N.y, y: N.x };
  ctx.fillStyle = COLORS.bad;
  ctx.beginPath();
  ctx.moveTo(N.x * R, N.y * R);
  ctx.lineTo(N.x * (R - 9) + p.x * 5, N.y * (R - 9) + p.y * 5);
  ctx.lineTo(N.x * (R - 9) - p.x * 5, N.y * (R - 9) - p.y * 5);
  ctx.closePath();
  ctx.fill();
  ctx.font = "700 10px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  (
    [
      ["N", 0],
      ["E", 90],
      ["S", 180],
      ["W", 270],
    ] as const
  ).forEach(([lab, b]) => {
    const d = bearingVec(b, northDeg);
    ctx.fillStyle = lab === "N" ? "#ff8a7d" : COLORS.textMuted;
    ctx.fillText(lab, d.x * (R + 7), d.y * (R + 7));
  });
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "start";
  ctx.restore();
}

function drawSun(
  ctx: CanvasRenderingContext2D,
  northDeg: number,
  h: ReturnType<typeof nowHour>,
  width: number,
) {
  if (!h || !h.sun || h.sun.altitude <= 0) return;
  const cx = width - 56,
    cy = 56,
    RR = 58;
  const v = bearingVec(h.sun.azimuth, northDeg);
  const x = cx + v.x * RR,
    y = cy + v.y * RR;
  ctx.save();
  ctx.strokeStyle = "rgba(255,211,77,.45)";
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(cx + v.x * 40, cy + v.y * 40);
  ctx.lineTo(x - v.x * 10, y - v.y * 10);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = "22px system-ui";
  ctx.fillText("☀️", x - 11, y + 8);
  ctx.restore();
}
