import { useStore } from "../../store/useStore";
import { TEMPLATES } from "../../lib/templates";
import { Card, Hint } from "../ui";

export function TemplatesCard() {
  const applyTemplate = useStore((s) => s.applyTemplate);

  return (
    <Card title="Quick start">
      <Hint>Load a layout, then drag rooms and walls to match your real flat.</Hint>
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
