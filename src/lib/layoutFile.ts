import type { Doc } from "../types";
import { defaultDoc, markLoadedRoomsMeasured, migrateFans } from "./doc";

/** Marker so we can recognise our own files and reject unrelated JSON. */
export const LAYOUT_FORMAT = "coolmicasa.layout";
export const LAYOUT_VERSION = 2;

/** The on-disk shape of a saved/shared layout: a versioned wrapper around the Doc. */
export interface LayoutFile {
  format: typeof LAYOUT_FORMAT;
  version: number;
  savedAt: string;
  doc: Doc;
}

export type ParseResult = { ok: true; doc: Doc } | { ok: false; error: string };

const isArr = (v: unknown): v is unknown[] => Array.isArray(v);

/** Serialize the current document to a shareable, pretty-printed JSON string. */
export function serializeLayout(doc: Doc): string {
  const file: LayoutFile = {
    format: LAYOUT_FORMAT,
    version: LAYOUT_VERSION,
    savedAt: new Date().toISOString(),
    doc,
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Parse & validate an exported layout. Accepts either our wrapped {@link LayoutFile}
 * or a bare `Doc` (so a raw localStorage export still loads). Never throws — bad input
 * comes back as `{ ok: false, error }`. Missing settings fall back to {@link defaultDoc}.
 */
export function parseLayoutFile(text: string): ParseResult {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  if (!obj || typeof obj !== "object") {
    return { ok: false, error: "That file doesn't look like a CoolMiCasa layout." };
  }
  // Accept the wrapped file ({ doc }) or a bare document.
  const raw = (obj as { doc?: unknown }).doc ?? obj;
  if (!raw || typeof raw !== "object" || !isArr((raw as { rooms?: unknown }).rooms)) {
    return { ok: false, error: "That file doesn't look like a CoolMiCasa layout — no rooms found." };
  }
  migrateFans(raw as Record<string, unknown>);
  const r = raw as Partial<Doc>;
  const doc = markLoadedRoomsMeasured({
    ...defaultDoc(),
    ...r,
    rooms: r.rooms ?? [],
    windows: isArr(r.windows) ? r.windows : [],
    doors: isArr(r.doors) ? r.doors : [],
  });
  return { ok: true, doc };
}

/** A friendly, filesystem-safe filename for the current layout (uses the location, if set). */
export function suggestLayoutFilename(doc: Doc): string {
  const base = doc.location?.name?.split(",")[0] ?? "layout";
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "layout";
  const date = new Date().toISOString().slice(0, 10);
  return `coolmicasa-${slug}-${date}.json`;
}

/** Trigger a browser download of the current layout as a shareable JSON file. */
export function downloadLayout(doc: Doc): void {
  const blob = new Blob([serializeLayout(doc)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestLayoutFilename(doc);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
