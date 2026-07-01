import type { Doc, Pt, Weather, WindowItem } from "../types";
import type { AirflowResult } from "./airflow";
import {
  angDiff,
  compassName,
  doorBetween,
  outwardVec,
  roomById,
  roomCenter,
  windowFacing,
  windowMid,
  winSill,
  winTop,
} from "./geometry";
import { fmt, nowHour, roomTarget } from "./recommend";

export interface FanSpot {
  x: number;
  y: number;
  dir: Pt;
  heightM: number;
  heightName: string;
  label: string;
  why: string;
  prio: number;
}

export interface StackInfo {
  dH: number | null;
  exTop: number | null;
  inSill: number | null;
  exWin: WindowItem | null;
  inWin: WindowItem | null;
}

export interface FanPlan {
  spots: FanSpot[];
  stack: StackInfo | null;
}

/**
 * Exact position + height recommendations for portable fans.
 * heightM is metres above floor; `why` explains the physics.
 */
export function buildFanPlan(doc: Doc, weather: Weather | null, air: AirflowResult): FanPlan {
  const h = nowHour(weather);
  if (!h || !weather) return { spots: [], stack: null };

  const wd = weather.current.windDir;
  const rooms = doc.rooms;
  const plan: FanSpot[] = [];
  let stack: StackInfo | null = null;

  if (air.active) {
    const CH = doc.ceilingH || 2.5;
    const canSeal = !!doc.canSealFan;

    // 1) PRIMARY EXHAUST — leeward + highest + warmest-over-target opening (stack effect)
    let exWin: WindowItem | null = null,
      exScore = -1e9;
    air.openWins.forEach((w) => {
      if (!air.exhaustRooms.has(w.roomId)) return;
      const lee = air.calm ? 0 : angDiff(windowFacing(w, doc.northDeg), wd);
      const r = roomById(rooms, w.roomId);
      const over = r ? Math.max(0, (+r.temp || 0) - roomTarget(doc, r)) : 0;
      const score = lee * 0.5 + winTop(w, CH) * 40 + (+(r?.temp ?? 0) || 0) + over * 3;
      if (score > exScore) {
        exScore = score;
        exWin = w;
      }
    });
    if (!exWin) {
      air.openWins.forEach((w) => {
        const s = (air.calm ? 0 : angDiff(windowFacing(w, doc.northDeg), wd)) * 0.5 + winTop(w, CH) * 40;
        if (s > exScore) {
          exScore = s;
          exWin = w;
        }
      });
    }

    // INTAKE — windward + lowest sill + coolest air in front
    let inWin: WindowItem | null = null,
      inScore = -1e9;
    air.openWins.forEach((w) => {
      if (w === exWin) return;
      const wind = air.calm ? 0 : 180 - angDiff(windowFacing(w, doc.northDeg), wd);
      const outT = w.temp != null ? +w.temp : h.temp;
      const score = wind * 0.5 - winSill(w) * 40 - outT;
      if (score > inScore) {
        inScore = score;
        inWin = w;
      }
    });

    let exTop: number | null = null,
      inSill: number | null = null;
    if (exWin) {
      const ew: WindowItem = exWin;
      const m = windowMid(ew, rooms)!,
        v = outwardVec(ew.side),
        r = roomById(rooms, ew.roomId);
      exTop = winTop(ew, CH);
      const exH = canSeal ? exTop : Math.min(exTop, 1.3);
      plan.push({
        x: m.x,
        y: m.y,
        dir: v,
        heightM: +exH.toFixed(2),
        heightName: canSeal
          ? "HIGH — sealed into the top of the window opening"
          : "As high as it'll stand — on a shelf or sill just inside the open window, aimed OUT",
        label: `${canSeal ? "Box fan" : "Fan"}: ${r?.name ?? "room"}, ${compassName(windowFacing(ew, doc.northDeg))} window — blow OUT`,
        why: canSeal
          ? "Your engine. Seal it into the window blowing out so hot air can't loop back in. Hot air floats to the ceiling, so exhausting high harnesses the stack effect and pulls cool air in through every low opening."
          : "Your engine. You can't seal this one in, so stand it as high as you can just inside the open window blowing out, and stuff a towel into the gaps around it. It still drives hot ceiling air out and pulls the cross-breeze through — just less airtight than a sealed box fan.",
        prio: 1,
      });
    }

    // 2) INTAKE fan only when calm; with wind, just keep the low intake open
    if (inWin) {
      const iw: WindowItem = inWin;
      inSill = winSill(iw);
      if (air.calm) {
        const m = windowMid(iw, rooms)!,
          v = outwardVec(iw.side),
          r = roomById(rooms, iw.roomId);
        const inH = canSeal ? inSill : inSill + 0.2;
        plan.push({
          x: m.x,
          y: m.y,
          dir: { x: -v.x, y: -v.y },
          heightM: +inH.toFixed(2),
          heightName: canSeal
            ? "LOW — sealed into the window at the sill"
            : "LOW — on the floor by the open window, aimed in and slightly down",
          label: `${canSeal ? "Box fan" : "Fan"}: ${r?.name ?? "room"}, ${compassName(windowFacing(iw, doc.northDeg))} window — blow IN`,
          why: canSeal
            ? "No wind, so force the intake. Seal it into the opening (its back must face outside to grab cool air), blowing in and angled slightly down. Cool night air is dense and sinks, so this floods the floor and feeds the high exhaust."
            : "No wind, so force the intake. Set it low right by the open window blowing in and angled down, and block the side gaps with a towel since you can't seal it. Cool night air sinks, so this floods the floor and feeds the high exhaust.",
          prio: 2,
        });
      }
    }

    stack = {
      dH: exTop != null && inSill != null ? Math.max(0, exTop - inSill) : null,
      exTop,
      inSill,
      exWin,
      inWin,
    };

    const usedDoors = new Set<string>(),
      mh = +(CH * 0.45).toFixed(2);

    // 3) BERNOULLI / CONTINUITY BOOSTER — fan in a doorway ON the main breeze path
    if (air.paths.length) {
      let lp = air.paths[0];
      air.paths.forEach((p) => {
        if (p.roomPath.length > lp.roomPath.length) lp = p;
      });
      if (lp.roomPath.length >= 2) {
        const i = Math.floor((lp.roomPath.length - 1) / 2);
        const d = doorBetween(doc.doors, lp.roomPath[i], lp.roomPath[i + 1]);
        if (d && d.open) {
          const from = roomCenter(roomById(rooms, lp.roomPath[i])!),
            to = roomCenter(roomById(rooms, lp.roomPath[i + 1])!);
          const v = { x: to.x - from.x, y: to.y - from.y };
          const L = Math.hypot(v.x, v.y) || 1;
          const ux = v.x / L,
            uy = v.y / L,
            back = 26;
          usedDoors.add(d.id);
          plan.push({
            x: d.x - ux * back,
            y: d.y - uy * back,
            dir: { x: ux, y: uy },
            heightM: mh,
            heightName: "Chest height — stand it about half a metre BEFORE the doorway, aimed through it",
            label: `Booster fan: ${roomById(rooms, lp.roomPath[i])?.name} → ${roomById(rooms, lp.roomPath[i + 1])?.name} doorway`,
            why: "Don't jam it in the gap. A fan blows a tight jet but only sucks diffusely, so set it back ~½ m on the upstream side and shoot the jet through the doorway. The moving jet entrains surrounding air (jet-pump / Bernoulli effect), pushing far more through the constriction than the fan's own output.",
            prio: air.calm ? 4 : 2,
          });
        }
      }
    }

    // 4) RESCUE BOOSTERS — pull stagnant / one-sided rooms onto the flow path
    [...air.singleRooms, ...air.stagnant].forEach((rid) => {
      const d = doc.doors.find(
        (dd) =>
          (dd.roomA === rid && air.flowRooms.has(dd.roomB)) ||
          (dd.roomB === rid && air.flowRooms.has(dd.roomA)),
      );
      if (!d || usedDoors.has(d.id)) return;
      usedDoors.add(d.id);
      const otherId = d.roomA === rid ? d.roomB : d.roomA;
      const from = roomCenter(roomById(rooms, otherId)!),
        to = roomCenter(roomById(rooms, rid)!);
      const v = { x: to.x - from.x, y: to.y - from.y };
      const L = Math.hypot(v.x, v.y) || 1;
      const ux = v.x / L,
        uy = v.y / L,
        back = 26;
      const rname = roomById(rooms, rid)?.name ?? "room";
      plan.push({
        x: d.x - ux * back,
        y: d.y - uy * back,
        dir: { x: ux, y: uy },
        heightM: mh,
        heightName: "Chest height — about half a metre back on the breezy side, aimed through the doorway",
        label: `Doorway fan: push air into ${rname}`,
        why: `${rname} is off the main breeze. ${d.open ? "" : "Open this door, then "}stand a fan a bit before the doorway on the ventilated side and shoot the jet through — it entrains room air and drags fresh air in. Don't block the gap with it.`,
        prio: 5,
      });
    });
  } else {
    // SEALED — personal circulation fans in the rooms furthest over their own target
    const warm = rooms
      .filter((r) => (+r.temp || 0) >= roomTarget(doc, r) - 0.5)
      .sort((a, b) => +b.temp - roomTarget(doc, b) - (+a.temp - roomTarget(doc, a)));
    warm.forEach((r, i) => {
      const c = roomCenter(r);
      const horiz = r.w >= r.h;
      const over = +r.temp - roomTarget(doc, r);
      plan.push({
        x: c.x,
        y: c.y,
        dir: horiz ? { x: 1, y: 0 } : { x: 0, y: 1 },
        heightM: 1.1,
        heightName: "SEATED height (~1.0–1.2 m), aimed at where you sit/sleep",
        label: `Circulating fan: ${r.name} (${fmt(r.temp)}° · ${over > 0 ? "+" + fmt(over) : fmt(over)} vs target)`,
        why: "Windows are shut, so don't pull in hotter outside air. Moving air over skin feels ~3 °C cooler. A fan angled across a doorway also entrains and drags air from the next room (Bernoulli entrainment).",
        prio: 1 + i,
      });
    });
  }

  return { spots: plan.sort((a, b) => a.prio - b.prio).slice(0, 8), stack };
}
