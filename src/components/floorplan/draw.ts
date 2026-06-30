import type { AirflowResult } from "../../lib/airflow";
import type { FanSpot } from "../../lib/fanPlan";
import type { Doc, Pt, Selection, Weather } from "../../types";
import {
  compassName,
  doorWallVertical,
  outwardVec,
  roomById,
  windowFacing,
  windowMid,
  windowSegment,
} from "../../lib/geometry";
import { maxIndoor, nowHour, roomTarget, sunOnWindow, ventilate } from "../../lib/recommend";
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
  textBright: "#dfeaf5",
  textMuted: "#9fb4c9",
};

export interface DrawOpts {
  width: number;
  height: number;
  doc: Doc;
  weather: Weather | null;
  air: AirflowResult | null;
  fanSpots: FanSpot[];
  selection: Selection;
  temps: RoomTempMap;
}

export function drawScene(ctx: CanvasRenderingContext2D, o: DrawOpts) {
  const { width, height, doc, weather, air, fanSpots, selection, temps } = o;
  const h = nowHour(weather);
  const pxPerM = doc.pxPerM || 50;
  ctx.clearRect(0, 0, width, height);

  // grid
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 30) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += 30) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // rooms
  for (const r of doc.rooms) {
    const seld = selection?.type === "room" && selection.id === r.id;
    ctx.fillStyle = COLORS.roomFill;
    ctx.strokeStyle = seld ? COLORS.sel : COLORS.roomStroke;
    ctx.lineWidth = seld ? 3 : 2;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    if (air && air.active) {
      if (air.flowRooms.has(r.id)) {
        ctx.fillStyle = "rgba(94,198,255,.12)";
        ctx.fillRect(r.x, r.y, r.w, r.h);
      } else if (air.stagnant.has(r.id)) {
        ctx.fillStyle = "rgba(255,176,58,.10)";
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    }
    ctx.fillStyle = COLORS.textBright;
    ctx.font = "600 13px system-ui";
    ctx.fillText(r.name, r.x + 8, r.y + 18);

    // dimensions in metres (top-right of the room)
    if (pxPerM > 0 && r.w > 70) {
      ctx.fillStyle = COLORS.textMuted;
      ctx.font = "10px system-ui";
      ctx.textAlign = "right";
      ctx.fillText(`${(r.w / pxPerM).toFixed(1)}×${(r.h / pxPerM).toFixed(1)} m`, r.x + r.w - 6, r.y + 15);
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
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();
    if (selection?.type === "window" && selection.id === w.id) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
    }
    const m = windowMid(w, doc.rooms)!;
    ctx.fillStyle = COLORS.textMuted;
    ctx.font = "10px system-ui";
    ctx.fillText(compassName(windowFacing(w, doc.northDeg)), m.x - 6, m.y - 9);
    if (w.temp != null) {
      const v = outwardVec(w.side);
      ctx.fillStyle = "#7fd0ff";
      ctx.font = "700 11px system-ui";
      ctx.fillText(w.temp + "°", m.x + v.x * 16 - 8, m.y + v.y * 16 + 4);
    }
  }

  drawAirflow(ctx, air);
  drawDoors(ctx, doc, air, selection);
  drawGhostFans(ctx, fanSpots, doc.fanCount || 0);
  drawCompass(ctx, doc.northDeg, width);
  drawSun(ctx, doc.northDeg, h, width);
  drawScaleBar(ctx, pxPerM, width, height);
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

function drawAirflow(ctx: CanvasRenderingContext2D, air: AirflowResult | null) {
  if (!air || !air.active) return;
  ctx.save();
  ctx.fillStyle = "rgba(94,198,255,.9)";
  ctx.strokeStyle = "rgba(94,198,255,.5)";
  ctx.lineWidth = 3;
  for (const path of air.paths) {
    const pts = (path.pts || []).filter(Boolean) as Pt[];
    if (pts.length < 2) continue;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 1; i < pts.length; i++) arrowHead(ctx, pts[i - 1], pts[i]);
  }
  ctx.restore();
}

function drawDoors(
  ctx: CanvasRenderingContext2D,
  doc: Doc,
  air: AirflowResult | null,
  selection: Selection,
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
    ctx.fillStyle = d.open ? (onPath ? "#9fe0ff" : "#7fe0bd") : "#ff9d8f";
    ctx.font = "700 9px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(d.open ? "OPEN" : "SHUT", d.x, vert ? y2 + 13 : y1 - 7);
    ctx.textAlign = "start";
    ctx.restore();
  }
}

function drawGhostFans(ctx: CanvasRenderingContext2D, spots: FanSpot[], owned: number) {
  spots.forEach((f, idx) => {
    const have = idx < owned;
    const col = have ? "#7ee0ff" : "#5a6b7d";
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.globalAlpha = have ? 1 : 0.6;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 14, 0, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "16px system-ui";
    ctx.fillText("🌀", f.x - 9, f.y + 6);
    const L = 32,
      ex = f.x + f.dir.x * L,
      ey = f.y + f.dir.y * L;
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillStyle = col;
    arrowHead(ctx, { x: f.x, y: f.y }, { x: ex, y: ey });
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
    ctx.fillText("↕ " + f.heightM.toFixed(1) + "m", f.x - 18, f.y - 18);
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
