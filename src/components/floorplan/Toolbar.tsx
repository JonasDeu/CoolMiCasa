import { useStore } from "../../store/useStore";
import type { Tool } from "../../types";

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "select", label: "Select", icon: "✋" },
  { id: "room", label: "Room", icon: "▭" },
  { id: "window", label: "Window", icon: "▥" },
  { id: "door", label: "Door", icon: "🚪" },
];

export function Toolbar() {
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);

  return (
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
  );
}
