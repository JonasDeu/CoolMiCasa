import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useStore } from "../store/useStore";
import { analyzeAirflow, type AirflowResult } from "../lib/airflow";
import { buildActionPlan, type ActionPlan } from "../lib/actions";
import { buildFanPlan, type FanPlan } from "../lib/fanPlan";
import { computeRoomTemps, withEffectiveTemps, type RoomTempMap } from "../lib/temps";
import { forecastRoomTemps, type ForecastMap } from "../lib/forecast";
import { planOpenings, type OpeningsPlan } from "../lib/openings";
import type { Doc } from "../types";

interface Derived {
  /** Per-room effective temps + estimated flags. */
  temps: RoomTempMap;
  /** The document with every room's temp replaced by its effective value. */
  docEff: Doc;
  air: AirflowResult;
  plan: FanPlan;
  /** Explicit open/close verdicts for every window sash, blind and internal door. */
  openings: OpeningsPlan;
  /** Per-room hourly temperature projection for the next ~24 h. */
  forecast: ForecastMap;
  /** Everything above collapsed into one prioritized checklist + schedule; null until temps are known. */
  actions: ActionPlan | null;
}

const DerivedCtx = createContext<Derived | null>(null);

export function DerivedProvider({ children }: { children: ReactNode }) {
  const doc = useStore((s) => s.doc);
  const weather = useStore((s) => s.weather);

  const value = useMemo<Derived>(() => {
    const temps = computeRoomTemps(doc, weather);
    const docEff = withEffectiveTemps(doc, temps);
    const air = analyzeAirflow(docEff, weather);
    const plan = buildFanPlan(docEff, weather, air);
    const openings = planOpenings(docEff, weather, air);
    const forecast = forecastRoomTemps(docEff, weather, temps);
    const actions = buildActionPlan(docEff, weather, air, plan, openings);
    return { temps, docEff, air, plan, openings, forecast, actions };
  }, [doc, weather]);

  return <DerivedCtx.Provider value={value}>{children}</DerivedCtx.Provider>;
}

export function useDerived(): Derived {
  const v = useContext(DerivedCtx);
  if (!v) throw new Error("useDerived must be used within <DerivedProvider>");
  return v;
}
