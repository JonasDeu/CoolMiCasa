import { useStore } from "../../store/useStore";
import { TEMPLATES } from "../../lib/templates";
import { Card, Hint } from "../ui";

export function TemplatesCard() {
  const applyTemplate = useStore((s) => s.applyTemplate);

  const hasRooms = useStore((s) => s.doc.rooms.length > 0);

  return (
    <Card title="Quick start">
      <Hint>
        {hasRooms
          ? "Select a room, window, or door to edit it here. Or load another layout below — this replaces the current one (undo with Ctrl+Z)."
          : "Load a layout, then drag rooms and walls to match your real flat."}
      </Hint>
      <div className="templates">
        {TEMPLATES.map((t) => (
          <button key={t.id} className="template-btn" onClick={() => applyTemplate(t.id)}>
            <span className="template-btn__name">{t.name}</span>
            <span className="template-btn__blurb">{t.blurb}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}
