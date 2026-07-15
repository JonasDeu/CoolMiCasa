import { useRef, type ChangeEvent } from "react";
import { useStore } from "../store/useStore";
import type { AppMode } from "../types";
import { downloadLayout, parseLayoutFile } from "../lib/layoutFile";
import { Clock } from "./Clock";

interface Props {
  mode: AppMode;
  onMode: (m: AppMode) => void;
  onHelp: () => void;
  onSettings: () => void;
}

export function Header({ mode, onMode, onHelp, onSettings }: Props) {
  const location = useStore((s) => s.doc.location);
  const doc = useStore((s) => s.doc);
  const loadLayout = useStore((s) => s.loadLayout);
  const flash = useStore((s) => s.flash);
  const resetAll = useStore((s) => s.resetAll);
  const fileRef = useRef<HTMLInputElement>(null);

  function onSave() {
    downloadLayout(doc);
    flash("Saved to your downloads — share the file with anyone.");
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-picking the same file fires onChange again
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = parseLayoutFile(String(reader.result ?? ""));
      if (res.ok) loadLayout(res.doc);
      else flash(res.error);
    };
    reader.onerror = () => flash("Couldn't read that file.");
    reader.readAsText(file);
  }

  return (
    <header className="appbar">
      <span className="appbar__logo" aria-hidden>
        🏠❄️
      </span>
      <div className="appbar__brand">
        <h1>CoolMiCasa</h1>
        <div className="appbar__sub">Passive cooling helper — no AC required</div>
      </div>

      <div className="modeswitch" role="tablist" aria-label="App mode">
        <button
          role="tab"
          aria-selected={mode === "setup"}
          className={mode === "setup" ? "is-active" : ""}
          onClick={() => onMode("setup")}
          title="Build & edit your flat"
        >
          <span aria-hidden>✏️</span> <span className="btn-label">Setup</span>
        </button>
        <button
          role="tab"
          aria-selected={mode === "plan"}
          className={mode === "plan" ? "is-active" : ""}
          onClick={() => onMode("plan")}
          title="Your daily cooling plan"
        >
          <span aria-hidden>💡</span> <span className="btn-label">Plan</span>
        </button>
      </div>

      <div className="appbar__right">
        <Clock />
        {location && <div className="appbar__loc">📍 {location.name}</div>}
        <div className="appbar__actions">
          <button onClick={onSave} title="Save your flat to a file">
            <span aria-hidden>⬇</span> <span className="btn-label">Save</span>
          </button>
          <button onClick={() => fileRef.current?.click()} title="Load a flat from a file">
            <span aria-hidden>⬆</span> <span className="btn-label">Open</span>
          </button>
          <button onClick={onSettings} title="Location, orientation & comfort settings">
            <span aria-hidden>⚙️</span> <span className="btn-label">Settings</span>
          </button>
          <button onClick={onHelp} title="How CoolMiCasa works">
            <span aria-hidden>❓</span> <span className="btn-label">Help</span>
          </button>
          <button
            className="danger"
            title="Reset everything"
            onClick={() => {
              if (confirm("Reset everything (layout, location, temperatures)?")) resetAll();
            }}
          >
            Reset
          </button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" onChange={onPick} hidden />
    </header>
  );
}
