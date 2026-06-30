import type { Doc, Pt, Weather, WindowItem } from "../types";
import {
  doorBetween,
  roomById,
  roomCenter,
  windowFacing,
  windowMid,
  angDiff,
} from "./geometry";
import { nowHour, openWindowsNow } from "./recommend";

export interface Waypoints {
  roomPath: string[];
  pts: (Pt | null)[];
}

export interface DoorSuggestion {
  aName: string;
  bName: string;
}

export interface AirflowResult {
  openWins: WindowItem[];
  intakeRooms: Set<string>;
  exhaustRooms: Set<string>;
  flowRooms: Set<string>;
  singleRooms: Set<string>;
  stagnant: Set<string>;
  paths: Waypoints[];
  doorSuggest: DoorSuggestion[];
  calm: boolean;
  active: boolean;
}

const emptyResult = (): AirflowResult => ({
  openWins: [],
  intakeRooms: new Set(),
  exhaustRooms: new Set(),
  flowRooms: new Set(),
  singleRooms: new Set(),
  stagnant: new Set(),
  paths: [],
  doorSuggest: [],
  calm: false,
  active: false,
});

/** Union rooms joined by OPEN internal doors. */
function connectedComponents(doc: Doc) {
  const parent: Record<string, string> = {};
  doc.rooms.forEach((r) => (parent[r.id] = r.id));
  const find = (x: string): string => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const uni = (a: string, b: string) => {
    const ra = find(a),
      rb = find(b);
    if (ra && rb) parent[ra] = rb;
  };
  doc.doors.forEach((d) => {
    if (d.open && parent[d.roomA] != null && parent[d.roomB] != null) uni(d.roomA, d.roomB);
  });
  const comps: Record<string, string[]> = {};
  doc.rooms.forEach((r) => {
    const root = find(r.id);
    (comps[root] = comps[root] || []).push(r.id);
  });
  return { find, comps };
}

/** BFS room path through OPEN doors from any of starts to any of goals. */
function doorPath(doc: Doc, starts: string[], goals: string[]): string[] | null {
  const adj: Record<string, string[]> = {};
  doc.rooms.forEach((r) => (adj[r.id] = []));
  doc.doors.forEach((d) => {
    if (d.open && adj[d.roomA] && adj[d.roomB]) {
      adj[d.roomA].push(d.roomB);
      adj[d.roomB].push(d.roomA);
    }
  });
  const goalSet = new Set(goals),
    seen = new Set(starts),
    q: string[][] = starts.map((s) => [s]);
  while (q.length) {
    const path = q.shift()!,
      last = path[path.length - 1];
    if (goalSet.has(last)) return path;
    for (const nb of adj[last])
      if (!seen.has(nb)) {
        seen.add(nb);
        q.push(path.concat(nb));
      }
  }
  return null;
}

/** Turn a room-path into drawable waypoints: intake window → room centers via doors → exhaust window. */
function buildWaypoints(doc: Doc, roomPath: string[], openWins: WindowItem[]): Waypoints {
  const pts: (Pt | null)[] = [];
  const inWin = openWins.find((w) => w.roomId === roomPath[0]);
  if (inWin) pts.push(windowMid(inWin, doc.rooms));
  for (let i = 0; i < roomPath.length; i++) {
    const r = roomById(doc.rooms, roomPath[i]);
    if (r) pts.push(roomCenter(r));
    if (i < roomPath.length - 1) {
      const d = doorBetween(doc.doors, roomPath[i], roomPath[i + 1]);
      if (d) pts.push({ x: d.x, y: d.y });
    }
  }
  const outWin =
    [...openWins].reverse().find((w) => w.roomId === roomPath[roomPath.length - 1] && w !== inWin) ||
    openWins.find((w) => w.roomId === roomPath[roomPath.length - 1]);
  if (outWin) pts.push(windowMid(outWin, doc.rooms));
  return { roomPath, pts };
}

export function analyzeAirflow(doc: Doc, weather: Weather | null): AirflowResult {
  const res = emptyResult();
  const h = nowHour(weather);
  if (!h || !weather || doc.rooms.length === 0) return res;

  const wd = weather.current.windDir,
    ws = weather.current.windSpd;
  const openWins = openWindowsNow(doc, weather);
  res.openWins = openWins;
  if (openWins.length === 0) return res; // sealed: no cross-vent to model
  res.active = true;
  res.calm = ws == null || ws < 3;

  const roomsWithOpen = new Set(openWins.map((w) => w.roomId));
  if (res.calm) {
    // no wind: use the two most-opposed open windows as the intake/exhaust pair
    let best: { a: WindowItem; b: WindowItem; dd: number } | null = null;
    for (let i = 0; i < openWins.length; i++)
      for (let j = i + 1; j < openWins.length; j++) {
        const dd = angDiff(
          windowFacing(openWins[i], doc.northDeg),
          windowFacing(openWins[j], doc.northDeg),
        );
        if (!best || dd > best.dd) best = { a: openWins[i], b: openWins[j], dd };
      }
    if (best && best.dd > 60) {
      res.intakeRooms.add(best.a.roomId);
      res.exhaustRooms.add(best.b.roomId);
    }
  } else {
    openWins.forEach((w) => {
      const d = angDiff(windowFacing(w, doc.northDeg), wd);
      if (d < 60) res.intakeRooms.add(w.roomId);
      else if (d > 120) res.exhaustRooms.add(w.roomId);
    });
    // single-sided — still treat the other extreme as the missing partner
    if (res.intakeRooms.size && !res.exhaustRooms.size) {
      let best: WindowItem | null = null,
        bestD = -Infinity;
      for (const w of openWins) {
        const d = angDiff(windowFacing(w, doc.northDeg), wd);
        if (d > bestD) {
          bestD = d;
          best = w;
        }
      }
      if (best) res.exhaustRooms.add(best.roomId);
    } else if (!res.intakeRooms.size && res.exhaustRooms.size) {
      let best: WindowItem | null = null,
        bestD = Infinity;
      for (const w of openWins) {
        const d = angDiff(windowFacing(w, doc.northDeg), wd);
        if (d < bestD) {
          bestD = d;
          best = w;
        }
      }
      if (best) res.intakeRooms.add(best.roomId);
    }
  }

  // components & flow rooms
  const { find } = connectedComponents(doc);
  const compHasIntake: Record<string, boolean> = {},
    compHasExhaust: Record<string, boolean> = {},
    compHasOpen: Record<string, boolean> = {};
  [...res.intakeRooms].forEach((r) => (compHasIntake[find(r)] = true));
  [...res.exhaustRooms].forEach((r) => (compHasExhaust[find(r)] = true));
  [...roomsWithOpen].forEach((r) => (compHasOpen[find(r)] = true));
  doc.rooms.forEach((r) => {
    const c = find(r.id);
    if (compHasIntake[c] && compHasExhaust[c]) res.flowRooms.add(r.id);
    else if (compHasOpen[c]) res.singleRooms.add(r.id);
    else res.stagnant.add(r.id);
  });

  // build visual path(s): one per exhaust room reachable from an intake room
  const usedExhaust = new Set<string>();
  [...res.exhaustRooms].forEach((er) => {
    if (usedExhaust.has(er)) return;
    const p = doorPath(doc, [...res.intakeRooms], [er]);
    if (p) {
      usedExhaust.add(er);
      res.paths.push(buildWaypoints(doc, p, openWins));
    }
  });

  // suggest opening a CLOSED door that would link an intake comp to an exhaust comp
  doc.doors
    .filter((d) => !d.open)
    .forEach((d) => {
      const cA = find(d.roomA),
        cB = find(d.roomB);
      if (cA === cB) return;
      const givesBoth =
        (compHasIntake[cA] || compHasIntake[cB]) && (compHasExhaust[cA] || compHasExhaust[cB]);
      const alreadyBoth =
        (compHasIntake[cA] && compHasExhaust[cA]) || (compHasIntake[cB] && compHasExhaust[cB]);
      if (givesBoth && !alreadyBoth) {
        const ra = roomById(doc.rooms, d.roomA),
          rb = roomById(doc.rooms, d.roomB);
        if (ra && rb) res.doorSuggest.push({ aName: ra.name, bName: rb.name });
      }
    });

  return res;
}
