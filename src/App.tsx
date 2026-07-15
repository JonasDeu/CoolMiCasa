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
import { LocationCard } from "./components/setup/LocationCard";
import { TemplatesCard } from "./components/setup/TemplatesCard";
import { SelectionCard } from "./components/setup/SelectionCard";
import { SettingsDialog } from "./components/setup/SettingsDialog";
import { FloorPlanCanvas } from "./components/floorplan/FloorPlanCanvas";
import { Toolbar } from "./components/floorplan/Toolbar";
import { Card } from "./components/ui";

export function App() {
  useWeather(); // keep weather in sync with the location

  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const selection = useStore((s) => s.selection);
  const undo = useStore((s) => s.undo);
  const deleteItem = useStore((s) => s.deleteItem);

  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);

  // global keyboard: undo + delete (ignored while typing in a field, or in the plan view)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (mode !== "setup") return;
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
  }, [mode, selection, undo, deleteItem]);

  return (
    <DerivedProvider>
      <div className="app" data-mode={mode}>
        <Header
          mode={mode}
          onMode={setMode}
          onHelp={() => setHelp(true)}
          onSettings={() => setSettings(true)}
        />

        {mode === "setup" ? (
          <SetupView onDone={() => setMode("plan")} onSettings={() => setSettings(true)} />
        ) : (
          <PlanView onEdit={() => setMode("setup")} />
        )}

        <HelpDialog open={help} onClose={() => setHelp(false)} />
        <SettingsDialog open={settings} onClose={() => setSettings(false)} />
      </div>
    </DerivedProvider>
  );
}

/* ── Setup: build your flat. Templates + editor + the drawing canvas. ─────────── */
function SetupView({ onDone, onSettings }: { onDone: () => void; onSettings: () => void }) {
  const selection = useStore((s) => s.selection);
  const flashMsg = useStore((s) => s.flashMsg);
  const flash = useStore((s) => s.flash);
  const hasLocation = useStore((s) => !!s.doc.location);
  const roomCount = useStore((s) => s.doc.rooms.length);
  const ready = hasLocation && roomCount > 0;

  // auto-dismiss the flash toast
  useEffect(() => {
    if (!flashMsg) return;
    const t = setTimeout(() => flash(""), 3500);
    return () => clearTimeout(t);
  }, [flashMsg, flash]);

  const todo: string[] = [];
  if (!hasLocation) todo.push("set your location");
  if (roomCount === 0) todo.push("draw at least one room");

  return (
    <div className="setup-view">
      <div className="setup-intro">
        <div>
          <h2 className="setup-intro__title">Set up your home</h2>
          <p className="setup-intro__sub">
            {ready
              ? "Looks good — you can switch to your plan any time. Come back here whenever your flat changes."
              : `Pick a layout and draw your flat, then ${todo.join(" and ")}.`}
          </p>
        </div>
        <div className="setup-intro__actions">
          <button onClick={onSettings} title="Location, orientation & comfort">
            <span aria-hidden>⚙️</span> Settings
          </button>
          <button className="primary" onClick={onDone} title="See your cooling plan">
            Show my plan →
          </button>
        </div>
      </div>

      <div className="setup-view__body">
        <aside className="col setup-view__side">
          {selection ? (
            <SelectionCard />
          ) : (
            <>
              <LocationCard />
              <TemplatesCard />
            </>
          )}
        </aside>

        <main className="setup-view__plan">
          <div className="canvas-area">
            <div className="canvas-wrap">
              <Toolbar />
              <FloorPlanCanvas />
              {flashMsg && <div className="toast">{flashMsg}</div>}
            </div>
          </div>
          <Legend />
        </main>
      </div>
    </div>
  );
}

/* ── Plan: the daily story — do this now → later → why → outlook. ─────────────── */
function PlanView({ onEdit }: { onEdit: () => void }) {
  const flashMsg = useStore((s) => s.flashMsg);
  const flash = useStore((s) => s.flash);

  useEffect(() => {
    if (!flashMsg) return;
    const t = setTimeout(() => flash(""), 3500);
    return () => clearTimeout(t);
  }, [flashMsg, flash]);

  return (
    <>
      <NowBanner />
      <div className="plan-view">
        <div className="col plan-view__advice">
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
        </div>

        <aside className="col plan-view__map">
          <Card
            title="Your home"
            right={
              <button onClick={onEdit} title="Edit your flat">
                <span aria-hidden>✏️</span> Edit flat
              </button>
            }
          >
            <div className="canvas-wrap canvas-wrap--map">
              <FloorPlanCanvas readOnly />
              {flashMsg && <div className="toast">{flashMsg}</div>}
            </div>
            <Legend />
          </Card>
        </aside>
      </div>
    </>
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
