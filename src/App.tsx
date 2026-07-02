import { useEffect, useState } from "react";
import { useStore } from "./store/useStore";
import { useWeather } from "./hooks/useWeather";
import { DerivedProvider } from "./state/derived";
import { Header } from "./components/Header";
import { HelpDialog } from "./components/HelpDialog";
import { NowBanner } from "./components/advice/NowBanner";
import { ActionList } from "./components/advice/ActionList";
import { UpNext } from "./components/advice/UpNext";
import { FanPlanPanel } from "./components/advice/FanPlanPanel";
import { RoomForecast } from "./components/advice/RoomForecast";
import { Timeline } from "./components/advice/Timeline";
import { TemplatesCard } from "./components/setup/TemplatesCard";
import { SelectionCard } from "./components/setup/SelectionCard";
import { SettingsDialog } from "./components/setup/SettingsDialog";
import { FloorPlanCanvas } from "./components/floorplan/FloorPlanCanvas";
import { Toolbar } from "./components/floorplan/Toolbar";
import { Card } from "./components/ui";

type Tab = "setup" | "plan" | "advice";

export function App() {
  useWeather(); // keep weather in sync with the location

  const selection = useStore((s) => s.selection);
  const flashMsg = useStore((s) => s.flashMsg);
  const flash = useStore((s) => s.flash);
  const undo = useStore((s) => s.undo);
  const deleteItem = useStore((s) => s.deleteItem);

  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const [tab, setTab] = useState<Tab>("plan");

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
    <DerivedProvider>
      <div className="app">
        <Header onHelp={() => setHelp(true)} onSettings={() => setSettings(true)} />
        <NowBanner />

        <div className="layout" data-tab={tab}>
          {/* INSPECTOR — the selected item, or Quick-start when nothing is selected */}
          <aside className="col col--setup">{selection ? <SelectionCard /> : <TemplatesCard />}</aside>

          {/* FLOOR PLAN */}
          <main className="col col--plan">
            <div className="canvas-area">
              <div className="canvas-wrap">
                <Toolbar />
                <FloorPlanCanvas />
                {flashMsg && <div className="toast">{flashMsg}</div>}
              </div>
            </div>
            <Legend />
          </main>

          {/* ADVICE — the story reads top-to-bottom: do this now → come back at these
              times → why the air moves this way → how warm it gets, room by room */}
          <aside className="col col--advice">
            <Card title="Do this now">
              <ActionList />
            </Card>
            <Card title="Coming up">
              <UpNext />
            </Card>
            <Card title="Airflow & fans">
              <FanPlanPanel />
            </Card>
            <Card title="Room temperature outlook">
              <RoomForecast />
            </Card>
            <Card title="Next 24 hours">
              <Timeline />
            </Card>
          </aside>
        </div>

        <nav className="tabbar">
          {(["setup", "plan", "advice"] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? "is-active" : ""} onClick={() => setTab(t)}>
              {t === "setup" ? "✏️ Edit" : t === "plan" ? "🗺 Plan" : "💡 Advice"}
            </button>
          ))}
        </nav>

        <HelpDialog open={help} onClose={() => setHelp(false)} />
        <SettingsDialog open={settings} onClose={() => setSettings(false)} />
      </div>
    </DerivedProvider>
  );
}

function Legend() {
  const items: [string, string][] = [
    ["var(--good)", "Open window (ventilate)"],
    ["var(--warn)", "Keep closed"],
    ["var(--sun)", "Direct sun → shade it"],
    ["#7fd0ff", "Air flowing in"],
    ["#ffb27a", "Air flowing out"],
    ["var(--accent)", "Breeze path (flowing dashes)"],
  ];
  return (
    <div className="legend">
      {items.map(([c, label]) => (
        <span key={label}>
          <span className="swatch" style={{ background: c }} />
          {label}
        </span>
      ))}
      <span>🌀 Fan spot (numbered, best first; bright = you own it, grey = extra)</span>
    </div>
  );
}
