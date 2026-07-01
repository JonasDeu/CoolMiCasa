import { useStore } from "../../store/useStore";
import type { Tool } from "../../types";

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "select", label: "Select", icon: "✋" },
  { id: "room", label: "Room", icon: "▭" },
  { id: "window", label: "Window", icon: "▥" },
  { id: "door", label: "Door", icon: "🚪" },
];

const HINTS: Record<Tool, string> = {
  select:
    "Drag empty space to pan, scroll to zoom. Click to select, drag to move, drag a corner to resize. Double-click a room (now + target temp) or a window (outdoor temp) to set temperatures.",
  room: "Click and drag on the canvas to draw a room. Middle-drag to pan, scroll to zoom.",
  window: "Click on (or near) a wall to drop a window, then drag it to slide along the wall. Middle-drag to pan, scroll to zoom.",
  door: "Click the wall between two rooms to connect them. Double-click a door to open/shut it. Middle-drag to pan, scroll to zoom.",
};

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);

  return (
    <>
      <div className="toolbar__tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`toolbar__btn ${tool === t.id ? "is-active" : ""}`}
            onClick={() => setTool(t.id)}
            title={t.label}
          >
            <span className="toolbar__icon">{t.icon}</span>
            <span className="toolbar__label">{t.label}</span>
          </button>
        ))}
      </div>
      <div className="toolbar__hint">{HINTS[tool]}</div>
    </>
  );
}
