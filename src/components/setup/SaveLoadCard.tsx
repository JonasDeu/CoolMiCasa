import { useRef, type ChangeEvent } from "react";
import { useStore } from "../../store/useStore";
import { downloadLayout, parseLayoutFile } from "../../lib/layoutFile";
import { Card, Hint } from "../ui";

export function SaveLoadCard() {
  const doc = useStore((s) => s.doc);
  const loadLayout = useStore((s) => s.loadLayout);
  const flash = useStore((s) => s.flash);
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
    <Card title="Save & share">
      <Hint>
        Download your flat as a file to back it up or send to someone. Loading a file replaces the current layout — undo
        with Ctrl+Z.
      </Hint>
      <div className="row mt">
        <button className="full" onClick={onSave}>
          ⬇ Save to file
        </button>
        <button className="full" onClick={() => fileRef.current?.click()}>
          ⬆ Load from file
        </button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" onChange={onPick} hidden />
    </Card>
  );
}
