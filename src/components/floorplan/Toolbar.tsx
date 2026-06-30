import { useStore } from "../../store/useStore";
import type { Tool } from "../../types";

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "select", label: "Select", icon: "✋" },
  { id: "room", label: "Room", icon: "▭" },
  { id: "window", label: "Window", icon: "▥" },
  { id: "door", label: "Door", icon: "🚪" },
];

const HINTS: Record<Tool, string> = {
  select: "Click a room, window or door to edit it. Drag to move; drag the corner of a room to resize.",
  room: "Click and drag on the canvas to draw a room.",
  window: "Click on (or near) a wall to drop a window, then drag it to slide along the wall.",
  door: "Click the wall between two rooms to connect them. Double-click a door to open/shut it.",
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
