import type { Doc, Door, FanSize, Pt, Room, Weather, WindowItem } from "../types";
import type { AirflowResult } from "./airflow";
import {
  angDiff,
  compassName,
  openingFactor,
  outwardVec,
  roomById,
  roomCenter,
  windowFacing,
  windowMid,
  winSill,
  winTop,
} from "./geometry";
import { maxIndoor, nowHour, roomTarget, ventilate } from "./recommend";

export type FanKind = "exhaust" | "intake" | "boost" | "personal";

export interface FanSpot {
  kind: FanKind;
  x: number;
  y: number;
  dir: Pt;
  heightM: number;
  /** Short placement phrase, e.g. "sealed into the top of the window, blowing out". */
  place: string;
  /** Short card title, e.g. "Bedroom — blow OUT the SW window". */
  label: string;
  /** One-sentence reason this spot earns a fan right now. */
  why: string;
  /** Relative usefulness right now, 0..1 — drives ordering and the strength bar. */
  benefit: number;
}

export interface StackInfo {
  dH: number | null;
  exTop: number | null;
  inSill: number | null;
  exWin: WindowItem | null;
  inWin: WindowItem | null;
}

export interface FanPlan {
  mode: "flush" | "sealed" | "off";
  /** One-line strategy summary shown above the fan cards. */
  headline: string;
  /** Schedule hint, e.g. "flush until ≈ 07:00" or "reopen ≈ 21:00". */
  until: string | null;
  spots: FanSpot[];
  stack: StackInfo | null;
}

/** How much air the user's fans can actually move, relative to a normal room fan. */
const SIZE_GAIN: Record<FanSize, number> = { small: 0.55, medium: 1, large: 1.2 };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const hh = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/** Cooling need of a room right now, 0..1 — degrees over target plus a priority nudge. */
function roomNeed(doc: Doc, r: Room): number {
  const over = (+r.temp || 0) - roomTarget(doc, r);
  if (over <= -0.5) return 0;
  return clamp01(clamp01((over + 0.5) / 3.5) + (r.priority ? 0.3 : 0));
}

/** First forecast hour where the open/close verdict flips to `wantOpen`, or null. */
function flipHour(doc: Doc, weather: Weather, wantOpen: boolean): number | null {
  const inT = maxIndoor(doc.rooms);
  if (inT == null) return null;
  const end = Math.min(weather.nowIdx + 24, weather.hours.length);
  for (let i = weather.nowIdx + 1; i < end; i++) {
    if (ventilate(weather.hours[i].temp, inT, +doc.comfort) === wantOpen) return weather.hours[i].hour;
  }
  return null;
}

/**
 * Fan strategy as marginal-benefit ranking: every candidate spot (window exhaust,
 * window intake, doorway booster, personal breeze) is scored by how much cooling it
 * ADDS given the natural flow the airflow model found. Strong natural cross-breeze →
 * window fans score low and fans go to under-served rooms and people; still air →
 * the fans are the engine (exhaust high, intake low); a throttled side (intake- or
 * exhaust-starved) pulls the fan to the bottleneck.
 */
export function buildFanPlan(doc: Doc, weather: Weather | null, air: AirflowResult): FanPlan {
  const h = nowHour(weather);
  if (!h || !weather || doc.rooms.length === 0)
    return { mode: "off", headline: "", until: null, spots: [], stack: null };
  return air.active ? flushPlan(doc, weather, air) : sealedPlan(doc, weather);
}

// ============================== FLUSH MODE ==========================================

function flushPlan(doc: Doc, weather: Weather, air: AirflowResult): FanPlan {
  const h = nowHour(weather)!;
  const CH = doc.ceilingH || 2.5;
  const canSeal = !!doc.canSealFan;
  const size = SIZE_GAIN[doc.fanSize] ?? 1;
  const natural = air.Q;
  const wd = weather.current.windDir;
  const ws = weather.current.windSpd ?? 0;
  const rooms = doc.rooms;
  const spots: FanSpot[] = [];

  // ---- window fans: add pressure where nature is weakest -------------------------
  // EXHAUST — the pump. Best window: warm needy room, opens high and fully, leeward.
  let exWin: WindowItem | null = null,
    exScore = -Infinity;
  for (const w of air.openWins) {
    const r = roomById(rooms, w.roomId);
    if (!r) continue;
    const lee = air.calm ? 0.5 : angDiff(windowFacing(w, doc.northDeg), wd) / 180;
    if (!air.calm && ws >= 12 && lee < 0.25) continue; // never blow out against fresh wind
    const s = roomNeed(doc, r) * 1.1 + (winTop(w, CH) / CH) * 0.9 + openingFactor(w) * 0.7 + lee * 0.7;
    if (s > exScore) {
      exScore = s;
      exWin = w;
    }
  }

  // INTAKE — feeds the pump. Best window: coolest air outside, low sill, windward.
  let inWin: WindowItem | null = null,
    inScore = -Infinity;
  const outT = (w: WindowItem) => (w.temp != null ? +w.temp : h.temp);
  const outs = air.openWins.map(outT);
  const outLo = Math.min(...outs),
    outHi = Math.max(...outs);
  for (const w of air.openWins) {
    if (w === exWin) continue;
    const coolness = outHi > outLo ? (outHi - outT(w)) / (outHi - outLo) : 0.5;
    const wind = air.calm ? 0.5 : 1 - angDiff(windowFacing(w, doc.northDeg), wd) / 180;
    const s = coolness + (1 - winSill(w) / CH) * 0.8 + wind * 0.6 + openingFactor(w) * 0.5;
    if (s > inScore) {
      inScore = s;
      inWin = w;
    }
  }

  const stack: StackInfo = {
    exWin,
    inWin,
    exTop: exWin ? winTop(exWin, CH) : null,
    inSill: inWin ? winSill(inWin) : null,
    dH: exWin && inWin ? Math.max(0, winTop(exWin, CH) - winSill(inWin)) : null,
  };

  if (exWin) {
    const m = windowMid(exWin, rooms)!;
    const r = roomById(rooms, exWin.roomId);
    const top = winTop(exWin, CH);
    spots.push({
      kind: "exhaust",
      x: m.x,
      y: m.y,
      dir: outwardVec(exWin.side),
      heightM: +(canSeal ? top : Math.min(top, 1.3)).toFixed(1),
      place: canSeal
        ? "sealed into the top of the open window, blowing out"
        : "as high as it stands just inside the window, blowing out — towel the gaps",
      label: `${r?.name ?? "room"} — blow OUT the ${compassName(windowFacing(exWin, doc.northDeg))} window`,
      why: "The pump: pushing hot ceiling air out makes every other opening pull cool air in.",
      benefit: clamp01((1 - 0.7 * natural) * size * (air.limit === "exhaust" ? 1.2 : 1)),
    });
  }

  if (inWin && exWin) {
    const m = windowMid(inWin, rooms)!;
    const r = roomById(rooms, inWin.roomId);
    const v = outwardVec(inWin.side);
    const windward = !air.calm && angDiff(windowFacing(inWin, doc.northDeg), wd) < 50;
    spots.push({
      kind: "intake",
      x: m.x,
      y: m.y,
      dir: { x: -v.x, y: -v.y },
      heightM: +(canSeal ? winSill(inWin) : winSill(inWin) + 0.2).toFixed(1),
      place: canSeal
        ? "sealed low into the window, blowing in and slightly down"
        : "low by the open window, blowing in and slightly down",
      label: `${r?.name ?? "room"} — blow IN the ${compassName(windowFacing(inWin, doc.northDeg))} window`,
      why: windward
        ? "Wind already feeds this window — only add a fan here if the breeze stalls."
        : "Feeds the pump: cool air is dense, so pushing it in low floods the floor first.",
      benefit: clamp01(
        (1 - 0.8 * natural) * 0.9 * size * (air.limit === "intake" ? 1.25 : 1) * (windward ? 0.45 : 1),
      ),
    });
  }

  // ---- doorway boosters: route flow into rooms that need it and aren't getting it -
  const usedDoors = new Set<string>();
  const boosted = new Set<string>();
  const chest = +(CH * 0.45).toFixed(1);
  const drive = Math.max(natural, spots[0]?.benefit ?? 0); // is there air to redirect?
  const needy = rooms
    .map((r) => ({ r, need: roomNeed(doc, r), flow: air.roomFlow[r.id] ?? 0 }))
    .filter((c) => c.need > 0.05 && c.flow < 0.55)
    .sort((a, b) => b.need - a.need);
  for (const c of needy) {
    let door: Door | null = null,
      srcFlow = -1;
    for (const d of doc.doors) {
      const otherId = d.roomA === c.r.id ? d.roomB : d.roomB === c.r.id ? d.roomA : null;
      if (!otherId || usedDoors.has(d.id)) continue;
      const f = air.roomFlow[otherId] ?? 0;
      if (f > srcFlow && f > c.flow + 0.05) {
        srcFlow = f;
        door = d;
      }
    }
    if (!door) continue;
    usedDoors.add(door.id);
    boosted.add(c.r.id);
    const otherId = door.roomA === c.r.id ? door.roomB : door.roomA;
    const from = roomCenter(roomById(rooms, otherId)!),
      to = roomCenter(c.r);
    const L = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const ux = (to.x - from.x) / L,
      uy = (to.y - from.y) / L;
    spots.push({
      kind: "boost",
      x: door.x - ux * 26,
      y: door.y - uy * 26,
      dir: { x: ux, y: uy },
      heightM: chest,
      place: `~½ m before the ${door.open ? "" : "closed (open it!) "}doorway on the breezy side, aimed through`,
      label: `push air into ${c.r.priority ? "⭐ " : ""}${c.r.name}`,
      why: `${c.r.name} is off the main breeze — a jet through the doorway entrains far more air than the fan itself moves.`,
      benefit: clamp01(c.need * (1 - c.flow) * (0.55 + 0.45 * drive)),
    });
  }

  // ---- personal breeze for priority rooms still over target -----------------------
  for (const r of rooms) {
    if (!r.priority || boosted.has(r.id)) continue;
    if ((+r.temp || 0) - roomTarget(doc, r) <= 0) continue;
    const cen = roomCenter(r);
    spots.push({
      kind: "personal",
      x: cen.x,
      y: cen.y,
      dir: r.w >= r.h ? { x: 1, y: 0 } : { x: 0, y: 1 },
      heightM: 1.1,
      place: "seated height, aimed at where you sit or sleep",
      label: `${r.name} — breeze on skin`,
      why: "While the flush runs, moving air on skin feels ~3° cooler immediately.",
      benefit: clamp01(0.2 + 0.3 * roomNeed(doc, r)),
    });
  }

  spots.sort((a, b) => b.benefit - a.benefit);

  const untilH = flipHour(doc, weather, false);
  const until = untilH != null ? `flush until ≈ ${hh(untilH)}` : "cool outside all horizon — keep flushing";
  let headline: string;
  if (natural >= 0.55)
    headline = "Strong natural cross-breeze — the windows don't need help; fans go to weak rooms and people.";
  else if (natural >= 0.25) headline = "Some natural flow — one window fan makes the flush noticeably faster.";
  else headline = "Almost no natural drive — your fans are the engine: exhaust high, intake low.";
  if (air.limit === "intake") headline += " Intake is the bottleneck, so feeding air IN helps most.";
  else if (air.limit === "exhaust") headline += " Exhaust is the bottleneck, so blowing air OUT helps most.";

  return { mode: "flush", headline, until, spots: spots.slice(0, 6), stack };
}

// ============================== SEALED MODE =========================================

function sealedPlan(doc: Doc, weather: Weather): FanPlan {
  const rooms = doc.rooms;
  const chest = +((doc.ceilingH || 2.5) * 0.45).toFixed(1);
  const spots: FanSpot[] = [];

  // Personal cooling — priority rooms first, then whoever is furthest over target.
  const ranked = rooms
    .map((r) => ({ r, over: (+r.temp || 0) - roomTarget(doc, r) }))
    .filter((c) => c.over >= -0.5)
    .sort((a, b) => Number(!!b.r.priority) - Number(!!a.r.priority) || b.over - a.over);
  for (const c of ranked) {
    const cen = roomCenter(c.r);
    spots.push({
      kind: "personal",
      x: cen.x,
      y: cen.y,
      dir: c.r.w >= c.r.h ? { x: 1, y: 0 } : { x: 0, y: 1 },
      heightM: 1.1,
      place: "seated height, aimed at where you sit or sleep",
      label: `${c.r.priority ? "⭐ " : ""}${c.r.name} — breeze on skin`,
      why: "Windows shut, so don't import outside heat — moving air on skin feels ~3° cooler.",
      benefit: clamp01(0.35 + (c.r.priority ? 0.15 : 0) + 0.4 * clamp01(c.over / 4)),
    });
  }

  // Mixing: borrow air from a notably cooler neighbour through an open internal door.
  for (const d of doc.doors) {
    if (!d.open) continue;
    const a = roomById(rooms, d.roomA),
      b = roomById(rooms, d.roomB);
    if (!a || !b) continue;
    const warm = +a.temp >= +b.temp ? a : b;
    const cool = warm === a ? b : a;
    const dT = +warm.temp - +cool.temp;
    if (dT < 1.5 || +warm.temp <= roomTarget(doc, warm)) continue;
    const from = roomCenter(cool),
      to = roomCenter(warm);
    const L = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const ux = (to.x - from.x) / L,
      uy = (to.y - from.y) / L;
    spots.push({
      kind: "boost",
      x: d.x - ux * 26,
      y: d.y - uy * 26,
      dir: { x: ux, y: uy },
      heightM: chest,
      place: "~½ m before the doorway on the cool side, aimed into the warm room",
      label: `even out: ${cool.name} → ${warm.name}${warm.priority ? " ⭐" : ""}`,
      why: `${cool.name} is ${dT.toFixed(1)}° cooler — borrow its air until the two rooms even out.`,
      benefit: clamp01(0.25 + dT / 6 + (warm.priority ? 0.1 : 0)),
    });
  }

  spots.sort((a, b) => b.benefit - a.benefit);

  const reopenH = flipHour(doc, weather, true);
  return {
    mode: "sealed",
    headline: "Sealed against the heat — fans can't cool the flat now, only people. Aim at skin, not windows.",
    until: reopenH != null ? `reopen ≈ ${hh(reopenH)} — move fans to the windows then` : null,
    spots: spots.slice(0, 6),
    stack: null,
  };
}
