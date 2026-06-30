# CoolMiCasa ❄️🏠

A passive-cooling helper. Draw your flat, pull in the real hourly forecast, and get
hour-by-hour advice on **when to open windows, what to shade, and exactly where to put
fans** — no air conditioning required.

It models the physics that actually cool a flat for free:

- **Timed ventilation** — open up only when it's genuinely cooler outside than in.
- **Solar gain** — computes which windows the sun hits, hour by hour, so you can shade them in time.
- **Cross-ventilation** — traces the breeze path through open windows and doors (BFS over a room graph).
- **Stack effect** — exhaust high, intake low; the bigger the height gap and temperature difference, the stronger the free chimney draft.
- **Bernoulli / jet entrainment** — places a booster fan ~½ m back from a doorway so its jet drags far more air through than the fan alone moves.

Everything is saved in your browser. Nothing leaves your machine except the (key-less,
free) [Open-Meteo](https://open-meteo.com/) weather lookup.

## Stack

- **Vite + React + TypeScript**
- **Zustand** (+ Immer) for the document store, persistence and undo
- A `<canvas>` floor-plan editor
- The cooling logic lives in pure, typed modules under [`src/lib/`](src/lib) so it can be reasoned about and tested independently of the UI.

## Project layout

```
src/
  lib/            pure logic (no React)
    solar.ts        sun azimuth/altitude
    weather.ts      Open-Meteo geocoding + forecast
    geometry.ts     rooms / windows / doors / walls / snapping
    recommend.ts    ventilate?, sun-on-glass, wind roles, hour classification
    airflow.ts      cross-ventilation pathfinding
    fanPlan.ts      exact fan positions + heights (stack effect, Bernoulli)
    templates.ts    quick-start floor plans
  store/          Zustand store (persistence + undo)
  hooks/          useWeather (fetch + refresh + geolocation)
  components/
    floorplan/    canvas editor + imperative draw module + toolbar
    advice/       NowBanner, ActionList, FanPlanPanel, Timeline
    setup/        Location, Settings, Orientation, Templates, Selection cards
```

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build
```

## Deploy to GitHub Pages

A workflow at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds and
publishes on every push to `main`.

1. Push this repo to GitHub (the repo can be named anything — the workflow injects the
   right base path automatically via `VITE_BASE`).
2. In **Settings → Pages**, set **Source = GitHub Actions**.
3. Push to `main`. The site goes live at `https://<you>.github.io/<repo>/`.

> The previous single-file version is preserved at [`legacy/coolmicasa-v1.html`](legacy/coolmicasa-v1.html).
