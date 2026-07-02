import type { Doc, Pt, Weather, WindowItem } from "../types";
import {
  angDiff,
  doorBetween,
  openArea,
  roomById,
  roomCenter,
  windowFacing,
  windowMid,
  winSill,
  winTop,
} from "./geometry";
import { nowHour, openWindowsNow } from "./recommend";

/** Natural airflow through one open window. Positive q = air flows IN. */
export interface WindowFlow {
  win: WindowItem;
  /** Signed natural flow, relative units (opening area × √pressure). >0 in, <0 out. */
  q: number;
  role: "intake" | "exhaust";
  /** Relative magnitude among the open windows, 0..1. */
  strength: number;
}

export interface Waypoints {
  roomPath: string[];
  pts: (Pt | null)[];
  /** Share of the flat's natural flow this path carries, 0..1 (same scale as Q). */
  strength: number;
}

export interface DoorSuggestion {
  aName: string;
  bName: string;
  /** True when opening this door would bring a priority room onto the cross-breeze. */
  priority: boolean;
}

export interface AirflowResult {
  openWins: WindowItem[];
  /** Per-window natural flow (signed, with role and relative strength). */
  flows: WindowFlow[];
  flowByWin: Record<string, WindowFlow>;
  intakeRooms: Set<string>;
  exhaustRooms: Set<string>;
  flowRooms: Set<string>;
  singleRooms: Set<string>;
  stagnant: Set<string>;
  paths: Waypoints[];
  /** How well ventilated each room is right now, 0..1 on the same scale as Q. */
  roomFlow: Record<string, number>;
  doorSuggest: DoorSuggestion[];
  calm: boolean;
  active: boolean;
  /** Overall natural ventilation strength, 0..1 (still trickle → strong flush). */
  Q: number;
  /** Which side throttles the natural flow — where a fan adds the most. */
  limit: "intake" | "exhaust" | "balanced" | null;
}

const emptyResult = (): AirflowResult => ({
  openWins: [],
  flows: [],
  flowByWin: {},
  intakeRooms: new Set(),
  exhaustRooms: new Set(),
  flowRooms: new Set(),
  singleRooms: new Set(),
  stagnant: new Set(),
  paths: [],
  roomFlow: {},
  doorSuggest: [],
  calm: false,
  active: false,
  Q: 0,
  limit: null,
});

// ---- physical constants (pressures in ~Pa, flows in openArea·√Pa) -----------------
/** Wind pressure: ΔP ≈ 0.39 · v² · cos(θ) with v in m/s (½ρ·Cp, Cp ≈ ±0.65). */
const WIND_K = 0.39;
/** Stack pressure per °C per metre below the neutral plane: ΔP ≈ 0.04 · ΔT · Δz. */
const STACK_K = 0.04;
/** Cool air outside one facade is denser and noses in even without wind or Δheight. */
const FACADE_K = 0.03;
/** Reference flow that counts as a full-strength (Q = 1) natural flush. */
const Q_REF = 110;

/**
 * Signed natural flow through every open window from three real drivers:
 * wind pressure on the facade, stack buoyancy (warm inside → in low, out high,
 * about the area-weighted neutral plane), and facade temperature differences.
 */
function computeWindowFlows(doc: Doc, openWins: WindowItem[], outTemp: number, ws: number, wd: number): WindowFlow[] {
  const CH = doc.ceilingH || 2.5;
  const zMid = (w: WindowItem) => (winSill(w) + winTop(w, CH)) / 2;
  const outT = (w: WindowItem) => (w.temp != null ? +w.temp : outTemp);

  let zSum = 0,
    aSum = 0,
    tSum = 0;
  for (const w of openWins) {
    const a = openArea(w);
    zSum += a * zMid(w);
    aSum += a;
    tSum += outT(w);
  }
  const zN = aSum ? zSum / aSum : CH / 2; // neutral plane height
  const outMean = openWins.length ? tSum / openWins.length : outTemp;
  const v = ws / 3.6; // km/h → m/s

  const flows = openWins.map((w): WindowFlow => {
    const r = roomById(doc.rooms, w.roomId);
    const dT = (r ? +r.temp : outTemp) - outT(w); // indoor − outdoor at this window
    const cosT = Math.cos((angDiff(windowFacing(w, doc.northDeg), wd) * Math.PI) / 180);
    const p = WIND_K * v * v * cosT + STACK_K * dT * (zN - zMid(w)) + FACADE_K * (outMean - outT(w));
    const q = openArea(w) * Math.sign(p) * Math.sqrt(Math.abs(p));
    return { win: w, q, role: q >= 0 ? "intake" : "exhaust", strength: 0 };
  });

  const maxQ = Math.max(...flows.map((f) => Math.abs(f.q)), 1e-9);
  for (const f of flows) f.strength = Math.abs(f.q) / maxQ;
  return flows;
}

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
  return { find };
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
function buildWaypoints(doc: Doc, roomPath: string[], openWins: WindowItem[], strength: number): Waypoints {
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
  return { roomPath, pts, strength };
}

export function analyzeAirflow(doc: Doc, weather: Weather | null): AirflowResult {
  const res = emptyResult();
  const h = nowHour(weather);
  if (!h || !weather || doc.rooms.length === 0) return res;

  const wd = weather.current.windDir,
    ws = weather.current.windSpd ?? 0;
  const openWins = openWindowsNow(doc, weather);
  res.openWins = openWins;
  if (openWins.length === 0) return res; // sealed: no cross-vent to model
  res.active = true;
  res.calm = ws < 3;

  // ---- per-window natural flow + continuity balance ------------------------------
  res.flows = computeWindowFlows(doc, openWins, h.temp, ws, wd);
  res.flows.forEach((f) => (res.flowByWin[f.win.id] = f));

  let inQ = 0,
    outQ = 0;
  for (const f of res.flows) {
    if (f.q > 0) inQ += f.q;
    else outQ -= f.q;
    if (Math.abs(f.q) < 1e-6) continue; // undriven window: no role
    (f.q > 0 ? res.intakeRooms : res.exhaustRooms).add(f.win.roomId);
  }

  // Flow through openings in series: the weaker side throttles the whole exchange.
  let Qeff = 0;
  if (inQ > 1e-6 && outQ > 1e-6) {
    Qeff = (inQ * outQ) / Math.hypot(inQ, outQ);
    res.limit = inQ < 0.6 * outQ ? "intake" : outQ < 0.6 * inQ ? "exhaust" : "balanced";
  } else if (inQ > 1e-6 || outQ > 1e-6) {
    Qeff = 0.22 * Math.max(inQ, outQ); // single-sided: weak bidirectional exchange
    res.limit = inQ > outQ ? "exhaust" : "intake"; // the missing side
  }
  res.Q = Math.min(1, Qeff / Q_REF);
  if (res.Q < 0.04) res.Q = 0.04; // an open window always trades a trickle

  // ---- room classification via open-door components ------------------------------
  const roomsWithOpen = new Set(openWins.map((w) => w.roomId));
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

  // ---- visual paths, each carrying its share of the total flow --------------------
  [...res.exhaustRooms].forEach((er) => {
    const p = doorPath(doc, [...res.intakeRooms], [er]);
    if (!p) return;
    let exAbs = 0;
    for (const f of res.flows) if (f.q < 0 && f.win.roomId === er) exAbs -= f.q;
    const share = outQ > 1e-6 ? (exAbs / outQ) * Qeff : 0;
    res.paths.push(buildWaypoints(doc, p, openWins, Math.min(1, share / Q_REF)));
  });

  // ---- per-room flow level: path share where traced, component baseline elsewhere -
  doc.rooms.forEach((r) => {
    res.roomFlow[r.id] = res.flowRooms.has(r.id) ? 0.45 * res.Q : res.singleRooms.has(r.id) ? 0.18 * res.Q : 0;
  });
  for (const p of res.paths)
    for (const rid of p.roomPath) res.roomFlow[rid] = Math.max(res.roomFlow[rid] ?? 0, p.strength);

  // ---- suggest opening a CLOSED door that would link intake to exhaust ------------
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
        if (ra && rb)
          res.doorSuggest.push({ aName: ra.name, bName: rb.name, priority: !!(ra.priority || rb.priority) });
      }
    });
  // Surface the doors that connect a priority room to the breeze first.
  res.doorSuggest.sort((a, b) => Number(b.priority) - Number(a.priority));

  return res;
}
