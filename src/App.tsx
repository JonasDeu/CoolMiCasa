import { useEffect, useMemo, useState } from "react";
import { useStore } from "./store/useStore";
import { useWeather } from "./hooks/useWeather";
import { analyzeAirflow } from "./lib/airflow";
import { buildFanPlan } from "./lib/fanPlan";
import { Header } from "./components/Header";
import { HelpDialog } from "./components/HelpDialog";
import { NowBanner } from "./components/advice/NowBanner";
import { ActionList } from "./components/advice/ActionList";
import { FanPlanPanel } from "./components/advice/FanPlanPanel";
import { Timeline } from "./components/advice/Timeline";
import { LocationCard } from "./components/setup/LocationCard";
import { SettingsCard } from "./components/setup/SettingsCard";
import { OrientationCard } from "./components/setup/OrientationCard";
import { TemplatesCard } from "./components/setup/TemplatesCard";
import { SelectionCard } from "./components/setup/SelectionCard";
import { FloorPlanCanvas } from "./components/floorplan/FloorPlanCanvas";
import { Toolbar } from "./components/floorplan/Toolbar";
import { Card } from "./components/ui";

type Tab = "setup" | "plan" | "advice";

export function App() {
  useWeather(); // keep weather in sync with the location

  const doc = useStore((s) => s.doc);
  const weather = useStore((s) => s.weather);
  const selection = useStore((s) => s.selection);
  const flashMsg = useStore((s) => s.flashMsg);
  const flash = useStore((s) => s.flash);
  const undo = useStore((s) => s.undo);
  const deleteItem = useStore((s) => s.deleteItem);

  const [help, setHelp] = useState(false);
  const [tab, setTab] = useState<Tab>("plan");

  // The airflow + fan plan are derived once here and shared with the canvas and the panel.
  const air = useMemo(() => analyzeAirflow(doc, weather), [doc, weather]);
  const plan = useMemo(() => buildFanPlan(doc, weather, air), [doc, weather, air]);

  // global keyboard: undo + delete (ignored while typing in a field)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        undo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selection && !typing) {
        e.preventDefault();
        deleteItem(selection);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, undo, deleteItem]);

  // auto-dismiss the flash toast
  useEffect(() => {
    if (!flashMsg) return;
    const t = setTimeout(() => flash(""), 3500);
    return () => clearTimeout(t);
  }, [flashMsg, flash]);

  return (
    <div className="app">
      <Header onHelp={() => setHelp(true)} />
      <NowBanner />

      <div className="layout" data-tab={tab}>
        {/* SETUP */}
        <aside className="col col--setup">
          <LocationCard />
          <TemplatesCard />
          <SettingsCard />
          <OrientationCard />
          {selection && <SelectionCard />}
        </aside>

        {/* FLOOR PLAN */}
        <main className="col col--plan">
          <div className="canvas-wrap">
            <Toolbar />
            <FloorPlanCanvas air={air} fanSpots={plan.spots} />
            {flashMsg && <div className="toast">{flashMsg}</div>}
          </div>
          <Legend />
        </main>

        {/* ADVICE */}
        <aside className="col col--advice">
          <Card title="Do this now">
            <ActionList />
          </Card>
          <Card title="Airflow & fan plan">
            <FanPlanPanel air={air} plan={plan} />
          </Card>
          <Card title="Next 24 hours">
            <Timeline />
          </Card>
        </aside>
      </div>

      <nav className="tabbar">
        {(["setup", "plan", "advice"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "is-active" : ""} onClick={() => setTab(t)}>
            {t === "setup" ? "⚙️ Setup" : t === "plan" ? "🗺 Plan" : "💡 Advice"}
          </button>
        ))}
      </nav>

      <HelpDialog open={help} onClose={() => setHelp(false)} />
    </div>
  );
}

function Legend() {
  const items: [string, string][] = [
    ["var(--good)", "Open window (ventilate)"],
    ["var(--warn)", "Keep closed"],
    ["var(--sun)", "Direct sun → shade it"],
    ["var(--shade)", "Window (no verdict yet)"],
    ["var(--accent)", "Airflow path"],
  ];
  return (
    <div className="legend">
      {items.map(([c, label]) => (
        <span key={label}>
          <span className="swatch" style={{ background: c }} />
          {label}
        </span>
      ))}
      <span>🌀 Fan spot (numbered by priority; bright = use now, grey = extra)</span>
    </div>
  );
}
