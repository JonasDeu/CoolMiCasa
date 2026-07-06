import type { Doc, Weather } from "../types";
import type { AirflowResult } from "./airflow";
import { doorManaged, roomById, windowFacing, windowManaged } from "./geometry";
import {
  maxIndoor,
  nowHour,
  planVent,
  roomTarget,
  sunOnWindow,
  windRole,
  type WindRole,
} from "./recommend";

/** The explicit call for one window: what to do with the sash and the blind, and why. */
export interface WindowVerdict {
  sash: "open" | "close";
  /** "down" while the sun is on the glass, "up" otherwise; null = no blind fitted and no sun to block. */
  blind: "down" | "up" | null;
  /** Sun is on the glass but no shade is fitted — improvise something. */
  noShade: boolean;
  sunHit: boolean;
  wind: WindRole;
  /** Short reason for the sash call, e.g. "2.5° cooler outside". */
  reason: string;
  /** Humidity / tilt / rain caveat for the advice list, or null. */
  note: string | null;
  /** Hour (0–23) the sun next swings onto / off this glass, or null if no flip in the next ~14 h. */
  sunFlipH: number | null;
  /** Window is locked (not app-managed): `sash` reports its fixed state, never a change to make. */
  locked: boolean;
}

/** The call for one internal door, compared against its current open/shut state. */
export interface DoorVerdict {
  /** Recommended state; null = genuinely makes little difference right now. */
  want: "open" | "close" | null;
  /** True when the recommendation contradicts the door's current state. */
  change: boolean;
  /** A priority room drives the reasoning. */
  priority: boolean;
  /** Door is locked (not app-managed): the plan respects the drawn state, never flips it. */
  locked: boolean;
  aName: string;
  bName: string;
  reason: string;
}

export interface OpeningsPlan {
  windows: Record<string, WindowVerdict>;
  doors: Record<string, DoorVerdict>;
  /** How many doors are currently in the wrong state. */
  doorChanges: number;
}

const emptyPlan = (): OpeningsPlan => ({ windows: {}, doors: {}, doorChanges: 0 });

/** Is this door part of a traced breeze path? (same test the canvas highlight uses) */
function doorOnPath(air: AirflowResult, roomA: string, roomB: string): boolean {
  for (const p of air.paths) {
    for (let i = 0; i < p.roomPath.length - 1; i++) {
      const x = p.roomPath[i],
        y = p.roomPath[i + 1];
      if ((x === roomA && y === roomB) || (x === roomB && y === roomA)) return true;
    }
  }
  return false;
}

/**
 * Explicit open/close verdicts for every window sash, blind and internal door.
 * Window sashes follow the airflow model exactly (a window is "open" iff the
 * airflow analysis counts it open), so the canvas, list and physics never disagree.
 * Doors switch reasoning with the mode: while flushing they should connect the
 * breeze; while sealed they should isolate heat — unless a warm room can borrow
 * a cooler neighbour's air, and never at the cost of a cool priority room.
 */
export function planOpenings(doc: Doc, weather: Weather | null, air: AirflowResult): OpeningsPlan {
  const plan = emptyPlan();
  const h = nowHour(weather);
  if (!h || !weather) return plan;

  const openIds = new Set(air.openWins.map((w) => w.id));
  const wd = weather.current.windDir,
    ws = weather.current.windSpd ?? 0;

  // ---- windows: sash + blind ------------------------------------------------------
  for (const w of doc.windows) {
    const r = roomById(doc.rooms, w.roomId);
    const indoorT = r ? +r.temp : maxIndoor(doc.rooms);
    const target = r ? roomTarget(doc, r) : +doc.comfort;
    const outT = w.temp != null ? +w.temp : h.temp;
    const sunHit = sunOnWindow(w, h.sun, doc.northDeg) && h.rad > 120;
    const open = openIds.has(w.id);

    let reason: string;
    if (open) {
      reason = indoorT != null ? `${(indoorT - outT).toFixed(1)}° cooler outside` : "cooler outside";
    } else if (sunHit) {
      reason = "sun on the glass — heat pours in";
    } else if (indoorT != null && outT > indoorT - 1) {
      reason = "outside isn't cooler";
    } else {
      reason = "room already cool enough";
    }

    let note: string | null = null;
    if (open) {
      const outRhW = w.rh != null ? +w.rh : h.rh;
      const vp = planVent(outT, outRhW, indoorT, r?.rh ?? null, target, h.precip, h.precipProb);
      if (vp.importsMoisture) note = "💧 cooler but more humid outside — you'll import some stickiness";
      else if (vp.muggyOutside) note = "💧 outside air is humid — will feel sticky";
      if (w.opening === "tilt")
        note = (note ? note + " · " : "") + "only tilted (kipp) — swing it wide to flush faster";
      if (vp.raining) note = (note ? note + " · " : "") + "🌧 rain about — crack it, don't fling it";
    }

    // when the sun next swings onto (or off) this glass — drives "drop the blind ≈ hh:00"
    let sunFlipH: number | null = null;
    const end = Math.min(weather.nowIdx + 15, weather.hours.length);
    for (let i = weather.nowIdx + 1; i < end; i++) {
      const fh = weather.hours[i];
      if ((sunOnWindow(w, fh.sun, doc.northDeg) && fh.rad > 120) !== sunHit) {
        sunFlipH = fh.hour;
        break;
      }
    }

    plan.windows[w.id] = {
      sash: open ? "open" : "close",
      blind: sunHit ? "down" : w.shade ? "up" : null,
      noShade: sunHit && !w.shade,
      sunHit,
      wind: windRole(windowFacing(w, doc.northDeg), wd, ws),
      reason,
      note,
      sunFlipH,
      locked: !windowManaged(w),
    };
  }

  // ---- doors ----------------------------------------------------------------------
  const served = (rid: string) => air.flowRooms.has(rid) || air.singleRooms.has(rid);

  for (const d of doc.doors) {
    const a = roomById(doc.rooms, d.roomA),
      b = roomById(doc.rooms, d.roomB);
    if (!a || !b) continue;
    let want: DoorVerdict["want"] = null,
      reason = "",
      priority = false;

    // Locked door: the plan works around whatever state you drew — no flip suggested.
    if (!doorManaged(d)) {
      plan.doors[d.id] = {
        want: d.open ? "open" : "close",
        change: false,
        priority: false,
        locked: true,
        aName: a.name,
        bName: b.name,
        reason: `locked — left ${d.open ? "open" : "shut"} as you set it`,
      };
      continue;
    }

    if (air.active) {
      // flush mode: doors are the veins of the cross-breeze
      const suggest = air.doorSuggest.find((s) => s.id === d.id);
      if (d.open && (doorOnPath(air, d.roomA, d.roomB) || (air.flowRooms.has(a.id) && air.flowRooms.has(b.id)))) {
        want = "open";
        reason = "carries the cross-breeze — keep it open";
      } else if (suggest) {
        want = "open";
        reason = "opening it links intake to exhaust — connects the breeze";
        priority = suggest.priority;
      } else if (served(a.id) !== served(b.id)) {
        const dead = served(a.id) ? b : a;
        want = "open";
        reason = `lets fresh air reach ${dead.name}`;
        priority = !!dead.priority;
      } else if (d.open) {
        want = "open";
        reason = "keeps air mixing while the flush runs";
      } else {
        reason = "no breeze on either side — makes little difference";
      }
    } else {
      // sealed mode: isolate heat, unless a warm room can usefully borrow cool air
      const warm = +a.temp >= +b.temp ? a : b;
      const cool = warm === a ? b : a;
      const dT = +warm.temp - +cool.temp;
      if (dT < 1) {
        reason = "rooms are near the same temperature — either way is fine";
      } else if (cool.priority && !warm.priority) {
        want = "close";
        reason = `protect ⭐ ${cool.name} — ${warm.name} is ${dT.toFixed(1)}° warmer`;
        priority = true;
      } else if (dT >= 1.5 && +warm.temp > roomTarget(doc, warm)) {
        want = "open";
        reason = `share ${cool.name}'s cooler air with ${warm.name} — a doorway fan speeds it up`;
        priority = !!warm.priority;
      } else {
        want = "close";
        reason = `keep ${warm.name}'s heat out of ${cool.name}`;
      }
    }

    const change = want != null && (want === "open") !== d.open;
    if (change) plan.doorChanges++;
    plan.doors[d.id] = { want, change, priority, locked: false, aName: a.name, bName: b.name, reason };
  }

  return plan;
}
