import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useStore } from "../store/useStore";
import { analyzeAirflow, type AirflowResult } from "../lib/airflow";
import { buildFanPlan, type FanPlan } from "../lib/fanPlan";
import { computeRoomTemps, withEffectiveTemps, type RoomTempMap } from "../lib/temps";
import { forecastRoomTemps, type ForecastMap } from "../lib/forecast";
import type { Doc } from "../types";

interface Derived {
  /** Per-room effective temps + estimated flags. */
  temps: RoomTempMap;
  /** The document with every room's temp replaced by its effective value. */
  docEff: Doc;
  air: AirflowResult;
  plan: FanPlan;
  /** Per-room hourly temperature projection for the next ~24 h. */
  forecast: ForecastMap;
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
    const forecast = forecastRoomTemps(docEff, weather, temps);
    return { temps, docEff, air, plan, forecast };
  }, [doc, weather]);

  return <DerivedCtx.Provider value={value}>{children}</DerivedCtx.Provider>;
}

export function useDerived(): Derived {
  const v = useContext(DerivedCtx);
  if (!v) throw new Error("useDerived must be used within <DerivedProvider>");
  return v;
}
