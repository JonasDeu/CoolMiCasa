import type { Doc, Weather } from "../types";
import type { AirflowResult } from "./airflow";
import type { FanPlan } from "./fanPlan";
import type { OpeningsPlan } from "./openings";
import { compassName, roomById, windowFacing } from "./geometry";
import { buildStrategy, MASS_LABEL } from "./strategy";
import { dewPointC } from "./humidity";
import { flatIndoorRh, flatIndoorTemp, fmt, nowHour, planVent, roomMuggyNote } from "./recommend";

/** Formats an hour-of-day as "07:00". */
export const hh = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

export type StepKind = "shade" | "open" | "close" | "door" | "fan";

/** One concrete physical action, ready to render as a checklist row. */
export interface Step {
  id: string;
  kind: StepKind;
  /** Verb chip, e.g. "OPEN" / "SHADE" / "FAN 2". */
  verb: string;
  /** What & where, e.g. "Bedroom — NW window". */
  title: string;
  /** Why it matters, one short clause. */
  why: string;
  /** Caveat / timing hint shown small under the step, or null. */
  note: string | null;
  /** Sort weight — higher renders earlier. */
  weight: number;
}

/** Something already in the right state — reassurance, not work. */
export interface Confirmation {
  id: string;
  text: string;
}

/** A time-anchored change coming up within the forecast horizon. */
export interface UpcomingItem {
  /** Clock hour, 0–23. */
  hour: number;
  /** Hours from now — the chronological sort key (handles the midnight wrap). */
  inH: number;
  icon: string;
  text: string;
}

export type PlanMode = "flush" | "seal" | "hold";

export interface ActionPlan {
  mode: PlanMode;
  /** One line stating the goal every step below serves. */
  goal: string;
  /** Humidity / rain caveat under the goal, or null. */
  caveat: string | null;
  /** The muggiest room's dew-point warning, or null when all rooms feel fine. */
  muggy: string | null;
  /** The checklist: every physical action, highest impact first. */
  steps: Step[];
  /** Doors already in the right position — shown collapsed, not as work. */
  confirmed: Confirmation[];
  /** The next scheduled changes, soonest first. */
  upcoming: UpcomingItem[];
  /** Prompt shown when fan spots exist but the user has listed no fans. */
  fanHint: string | null;
}

/**
 * Collapse everything the pipeline knows into ONE prioritized to-do list plus a
 * schedule of what changes next. This is the single narrative the advice column
 * tells: "here's the goal, do these steps in this order, come back at these times."
 * Ordering: sun-blasted glass first (heat is pouring in *now*), then the openings
 * that drive the breeze, then door flips, then fan placements, and finally the
 * boring "close the rest" — aggregated into one step when it's repetitive.
 */
export function buildActionPlan(
  doc: Doc,
  weather: Weather | null,
  air: AirflowResult,
  fanPlan: FanPlan,
  openings: OpeningsPlan,
): ActionPlan | null {
  const h = nowHour(weather);
  if (!h || !weather) return null;
  const indoor = flatIndoorTemp(doc);
  if (indoor == null) return null;

  const vp = planVent(h.temp, h.rh, indoor, flatIndoorRh(doc), +doc.comfort, h.precip, h.precipProb);
  const strat = buildStrategy(doc, weather);
  const mode: PlanMode = vp.open || air.active ? "flush" : h.temp > indoor ? "seal" : "hold";

  // ---- the goal line ---------------------------------------------------------------
  let goal: string;
  if (mode === "flush") {
    const until = strat?.ventNow && strat.run?.endHour != null ? ` — worth it until ≈ ${hh(strat.run.endHour)}` : "";
    goal = `It's ${fmt(vp.tempGain)}° cooler outside — flush the day's heat out${until}.`;
    if (strat?.ventNow && strat.run && !strat.longEnough)
      goal += ` Only ${strat.run.length} h of cool ahead — too short to cool ${MASS_LABEL[doc.mass]} walls, so lean on shade and fans too.`;
  } else if (mode === "seal") {
    const next = strat?.run ? ` Next opening ≈ ${hh(strat.run.startHour)}.` : "";
    goal = `It's ${fmt(-vp.tempGain)}° warmer outside — keep it out and hold the cool you banked.${next}`;
  } else {
    const next = strat?.run ? ` Opening becomes worthwhile ≈ ${hh(strat.run.startHour)}.` : "";
    goal = `Outside is about the same as inside — opening gains nothing yet; stay shaded and wait.${next}`;
  }

  // ---- window steps ------------------------------------------------------------------
  const steps: Step[] = [];
  const closers: { id: string; title: string; why: string; note: string | null }[] = [];

  for (const w of doc.windows) {
    const v = openings.windows[w.id];
    if (!v) continue;
    const room = roomById(doc.rooms, w.roomId)?.name ?? "Room";
    const facing = compassName(windowFacing(w, doc.northDeg));
    const title = `${room} — ${facing} window`;

    if (v.sunHit) {
      steps.push({
        id: `shade-${w.id}`,
        kind: "shade",
        verb: "SHADE",
        title,
        why: w.shade
          ? "sun is on the glass — window shut, blind/curtain all the way down"
          : "sun on the glass and no blind fitted — improvise outside the glass (cardboard, foil, a towel)",
        note: v.sunFlipH != null ? `sun moves off ≈ ${hh(v.sunFlipH)}` : null,
        weight: 100,
      });
      continue;
    }

    if (v.sash === "open") {
      const role =
        v.wind === "windward"
          ? "main intake, the breeze blows in here"
          : v.wind === "leeward"
            ? "exhaust side, air should leave here"
            : null;
      const blindNote =
        w.shade && v.sunFlipH != null ? `☀️ sun arrives ≈ ${hh(v.sunFlipH)} — drop the blind then` : null;
      steps.push({
        id: `open-${w.id}`,
        kind: "open",
        verb: "OPEN",
        title,
        why: role ? `${v.reason} (${role})` : v.reason,
        note: [v.note, blindNote].filter(Boolean).join(" · ") || null,
        weight: 90 + (v.wind === "windward" ? 4 : v.wind === "leeward" ? 3 : 0),
      });
    } else {
      closers.push({
        id: `close-${w.id}`,
        title,
        why: v.reason,
        note: w.shade && v.sunFlipH != null ? `☀️ sun hits ≈ ${hh(v.sunFlipH)} — blind down by then` : null,
      });
    }
  }

  // Aggregate a pile of identical "close it" calls into one step — the interesting
  // actions shouldn't drown in six rows of the same instruction.
  const anyOpen = steps.some((s) => s.kind === "open");
  if (closers.length >= 3) {
    steps.push({
      id: "close-rest",
      kind: "close",
      verb: "CLOSE",
      title: anyOpen ? `The other ${closers.length} windows` : `All ${closers.length} windows`,
      why:
        mode === "flush"
          ? "no gain on these sides right now — don't dilute the breeze path"
          : "outside isn't cooler — every open window imports heat",
      note: null,
      weight: 45,
    });
  } else {
    for (const c of closers)
      steps.push({ id: c.id, kind: "close", verb: "CLOSE", title: c.title, why: c.why, note: c.note, weight: 45 });
  }

  // ---- door steps (flips) + confirmations --------------------------------------------
  const confirmed: Confirmation[] = [];
  for (const d of doc.doors) {
    const v = openings.doors[d.id];
    if (!v || !v.want) continue;
    if (v.change) {
      steps.push({
        id: `door-${d.id}`,
        kind: "door",
        verb: v.want === "open" ? "OPEN" : "CLOSE",
        title: `🚪 Door ${v.aName} ↔ ${v.bName}`,
        why: v.reason,
        note: "pulsing on the map — double-click it to flip",
        weight: 80 + (v.priority ? 5 : 0),
      });
    } else {
      confirmed.push({
        id: `door-${d.id}`,
        text: `Door ${v.aName} ↔ ${v.bName} stays ${d.open ? "open" : "shut"} — ${v.reason}`,
      });
    }
  }

  // ---- fan steps: one per fan the user actually owns ---------------------------------
  const owned = doc.fans.length;
  fanPlan.spots.slice(0, owned).forEach((f, i) => {
    steps.push({
      id: `fan-${i}`,
      kind: "fan",
      verb: `FAN ${i + 1}`,
      title: f.label,
      why: `${f.place}, ~${f.heightM.toFixed(1)} m up${f.fanSize ? ` — use your ${f.fanSize} fan` : ""}`,
      note: f.why,
      weight: 60 - i,
    });
  });
  const fanHint =
    owned === 0 && fanPlan.spots.length > 0
      ? "You haven't listed any fans — add them in Settings ⚙ and each one gets a numbered spot here and on the map."
      : null;

  steps.sort((a, b) => b.weight - a.weight);

  // ---- what changes next --------------------------------------------------------------
  const upcoming: UpcomingItem[] = [];
  const inH = (hour: number) => (hour - h.hour + 24) % 24;
  const push = (hour: number | null | undefined, icon: string, text: string) => {
    if (hour == null) return;
    const d = inH(hour);
    if (d > 0) upcoming.push({ hour, inH: d, icon, text });
  };

  if (strat) {
    if (strat.ventNow && strat.run) {
      push(strat.run.endHour, "🔒", "Outside overtakes your rooms — close the windows and drop the blinds");
    } else if (strat.run) {
      push(
        strat.run.startHour,
        "🪟",
        `Cool enough to open everything (down to ${fmt(strat.run.minTemp)}° out${
          strat.run.endHour != null ? `, until ≈ ${hh(strat.run.endHour)}` : ""
        })`,
      );
    }
    push(strat.coolest.hour, "🌙", `Coolest moment (${fmt(strat.coolest.temp)}°) — the best flush of the night`);
    const rain = strat.rainHours.find((r) => inH(r) > 0);
    push(rain, "🌧", "Rain — the best free cooling of the day; open up right after it passes");
  }

  // Sun swinging onto / off glass — one event per side, earliest occurrence wins.
  const flips = new Map<string, UpcomingItem>();
  for (const w of doc.windows) {
    const v = openings.windows[w.id];
    if (!v || v.sunFlipH == null) continue;
    const d = inH(v.sunFlipH);
    if (d <= 0) continue;
    const facing = compassName(windowFacing(w, doc.northDeg));
    const key = `${facing}-${v.sunHit ? "off" : "on"}`;
    const item: UpcomingItem = v.sunHit
      ? { hour: v.sunFlipH, inH: d, icon: "🌤", text: `Sun leaves the ${facing} glass — blinds up, window usable again` }
      : { hour: v.sunFlipH, inH: d, icon: "☀️", text: `Sun swings onto the ${facing} glass — have the blind down by then` };
    const prev = flips.get(key);
    if (!prev || d < prev.inH) flips.set(key, item);
  }
  upcoming.push(...flips.values());
  upcoming.sort((a, b) => a.inH - b.inH);

  // ---- the muggiest room's dew-point warning ------------------------------------------
  let muggy: string | null = null;
  let worstDew = -Infinity;
  for (const r of doc.rooms) {
    if (r.rh == null || !Number.isFinite(+r.rh)) continue;
    const note = roomMuggyNote(+r.temp, +r.rh);
    if (!note) continue;
    const dew = dewPointC(+r.temp, +r.rh);
    if (dew > worstDew) {
      worstDew = dew;
      muggy = `${r.name} — ${note}`;
    }
  }

  return { mode, goal, caveat: vp.caveat, muggy, steps, confirmed, upcoming: upcoming.slice(0, 6), fanHint };
}
