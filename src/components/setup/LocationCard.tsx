import { useState } from "react";
import { useStore } from "../../store/useStore";
import { useWeather } from "../../hooks/useWeather";
import { geocode } from "../../lib/weather";
import type { LatLon } from "../../types";
import { Card } from "../ui";

export function LocationCard() {
  const location = useStore((s) => s.doc.location);
  const { chooseLocation, useMyLocation } = useWeather();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LatLon[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function search() {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError("");
    setResults(null);
    try {
      const res = await geocode(q);
      setResults(res);
    } catch {
      setError("Lookup failed (offline?).");
    } finally {
      setBusy(false);
    }
  }

  function pick(loc: LatLon) {
    chooseLocation(loc);
    setResults(null);
    setQuery("");
  }

  return (
    <Card title="Location">
      <div className="row">
        <input
          type="text"
          value={query}
          placeholder="City, e.g. Berlin"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          style={{ flex: 2 }}
        />
        <button onClick={search} style={{ flex: "0 0 auto" }} disabled={busy}>
          {busy ? "…" : "Find"}
        </button>
      </div>

      {results && (
        <div className="results">
          {results.length === 0 ? (
            <div className="muted results__row">No matches.</div>
          ) : (
            results.map((r, i) => (
              <div key={i} className="results__row" onClick={() => pick(r)}>
                {r.name}
              </div>
            ))
          )}
        </div>
      )}
      {error && <div className="muted results__row">{error}</div>}

      <button
        className="full mt"
        onClick={() =>
          useMyLocation().catch((e) => setError(e.message))
        }
      >
        📍 Use my current location
      </button>
      {location && <div className="hint">📍 {location.name}</div>}
    </Card>
  );
}
