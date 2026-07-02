# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

CoolMiCasa is a passive-cooling helper: draw your flat on a canvas, pull the real hourly
forecast from Open-Meteo, and get hour-by-hour advice on when to open windows, what to
shade, and exactly where to place fans. Vite + React 18 + TypeScript, Zustand (+ Immer)
for state. Everything runs client-side; nothing leaves the machine except the key-less
Open-Meteo lookups. State persists to `localStorage`.

## Commands

```bash
npm install
npm run dev        # Vite dev server at http://localhost:5173
npm run build      # tsc --noEmit (strict) THEN vite build to dist/
npm run preview    # serve the production build
npm run typecheck  # tsc --noEmit only
```

There is **no test runner and no linter/formatter**. The only automated gate is
`npm run build` / `npm run typecheck`. `tsconfig.json` is `strict` with
`noUnusedLocals` + `noUnusedParameters`, so an unused variable or parameter *fails the
build* — clean these up as you go rather than leaving them for later.

## Architecture

### The derived pipeline is the heart of the app

Raw editable state (the `Doc`: rooms/windows/doors + settings) lives in the Zustand store.
All physics/advice is **pure functions in `src/lib/`** run through a single memoized
pipeline in `src/state/derived.tsx` (`DerivedProvider`), re-run only when `[doc, weather]`
change:

```
computeRoomTemps(doc, weather)        → per-room effective temps (+ estimated flags)
withEffectiveTemps(doc, temps)        → docEff: a copy of doc with room.temp replaced
analyzeAirflow(docEff, weather)       → intake/exhaust/flow rooms, BFS breeze paths, door suggestions
buildFanPlan(docEff, weather, air)    → exact fan positions, heights, and the "why" physics blurb
planOpenings(docEff, weather, air)    → per-window sash + blind verdicts, per-door open/close advice
```

`planOpenings` is the single source of truth for open/close/shade calls: the canvas
badges (`draw.ts`) and the advice list (`ActionList`) both render its verdicts, and its
window sashes follow `air.openWins` exactly so the physics and the advice never diverge.

Everything downstream of `computeRoomTemps` operates on **`docEff`, never the raw `doc`**.
This is the key indirection: rooms are either *measured* (real thermometer reading) or
*estimated* (`temps.ts` infers them from measured rooms + solar gain). `docEff` collapses
that distinction so `airflow.ts` and `fanPlan.ts` never worry about which is which.
Consume derived data via `useDerived()` — components use the **raw `doc` from the store**
only for inline editing inputs, and `docEff` from `useDerived` for all logic and rendering.

### Store, persistence, undo (`src/store/useStore.ts`)

Single Zustand+Immer store holds `doc`, `weather`, `selection`, `tool`, `undoStack`.
Note the deliberate split between **live-drag mutators** (`dragRoomMove`, `dragRoomResize`,
`dragDoorMove`, `dragWindowSnap`, `dragRoomDraw`) that mutate *without* persisting, and
`commit()` / `endDrawRoom()` which persist at drag end. Every non-drag mutator calls
`persist()` → `localStorage["coolmicasa.v2"]` (with a one-time migration from `.v1`).
Undo is coarse: JSON snapshots of the whole `doc` pushed onto `undoStack` (cap 40).

### Coordinate & unit model (`src/lib/geometry.ts`)

Two coordinate systems coexist and must not be confused:
- **Canvas pixels** — room `x/y/w/h`, window `len`, door `x/y`. The fixed `PX_PER_M`
  constant converts px↔metres; on-screen size is controlled by the view zoom (a pure
  display transform in `FloorPlanCanvas`/`draw.ts`), which never changes stored geometry.
- **Metres** — vertical geometry: window `sill`, `winH`, `doc.ceilingH`. These drive the
  **stack effect** in `fanPlan.ts` (exhaust high, intake low; bigger height gap = stronger draft).

Window orientation has the same two-layer trick: a window's `side` (`N/E/S/W`) is relative
to the *drawing*; the true compass bearing is `windowFacing(win, doc.northDeg)` — always go
through that when reasoning about sun or wind, never use `side` directly. `angDiff` gives the
0–180° separation used everywhere for "is the sun on this glass / is this window windward".

### Weather & solar (`src/lib/weather.ts`, `src/lib/solar.ts`)

`fetchWeather` hits Open-Meteo (no API key), builds an `Hour[]` for the next ~2 days, and
computes the sun's azimuth/altitude locally per hour via `sunPosition` (SunCalc-style math).
`nowIdx` marks the current hour. `useWeather()` refetches on location change and every 15 min.
Geocoding is a separate Open-Meteo endpoint.

### UI layers (`src/components/`)

- `floorplan/` — the `<canvas>` editor. `FloorPlanCanvas.tsx` owns all pointer/drag/pan/hit-test
  logic and inline temp editors; `draw.ts` is a pure imperative renderer (`drawScene`) called
  from an effect whenever derived data changes. `Toolbar.tsx` switches the active `tool`.
- `advice/` — `NowBanner`, `ActionList`, `FanPlanPanel`, `Timeline` render the derived plan.
- `setup/` — location, settings, north orientation, templates, and the selection editor cards.

## Conventions & gotchas

- The window type is `WindowItem`, deliberately **not** `Window` (avoids clashing with the DOM global).
- Add new cooling logic as a pure, typed module under `src/lib/` and wire it into the
  `DerivedProvider` pipeline — keep React out of the physics so it stays independently reasonable.
- Deploy is automatic: `.github/workflows/deploy.yml` builds on push to `main` and publishes
  to GitHub Pages. The Pages base path is injected via `VITE_BASE` = repo name, so the repo can
  be renamed freely (see `vite.config.ts`).
- `legacy/coolmicasa-v1.html` is the frozen single-file predecessor — reference only, not built.
