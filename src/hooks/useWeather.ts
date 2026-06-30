import { useCallback, useEffect } from "react";
import { useStore } from "../store/useStore";
import { fetchWeather } from "../lib/weather";
import type { LatLon } from "../types";

/**
 * Keeps weather in sync with the chosen location: fetches on change and every
 * 15 minutes, and exposes a manual refresh. Also handles selecting a location
 * (incl. geolocation) so the UI components stay thin.
 */
export function useWeather() {
  const location = useStore((s) => s.doc.location);
  const setWeather = useStore((s) => s.setWeather);
  const setLocation = useStore((s) => s.setLocation);

  const load = useCallback(
    async (loc: LatLon | null) => {
      if (!loc) {
        setWeather(null, "idle");
        return;
      }
      setWeather(useStore.getState().weather, "loading");
      try {
        const w = await fetchWeather(loc);
        setWeather(w, "ready");
      } catch {
        setWeather(null, "error");
      }
    },
    [setWeather],
  );

  // fetch when location changes
  useEffect(() => {
    load(location);
  }, [location, load]);

  // periodic refresh
  useEffect(() => {
    if (!location) return;
    const t = setInterval(() => load(location), 15 * 60 * 1000);
    return () => clearInterval(t);
  }, [location, load]);

  const chooseLocation = useCallback(
    (loc: LatLon) => {
      setLocation(loc);
    },
    [setLocation],
  );

  const useMyLocation = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not available in this browser."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) => {
          setLocation({
            name: `My location (${p.coords.latitude.toFixed(2)}, ${p.coords.longitude.toFixed(2)})`,
            lat: p.coords.latitude,
            lon: p.coords.longitude,
          });
          resolve();
        },
        () => reject(new Error("Couldn't get your location.")),
      );
    });
  }, [setLocation]);

  return { chooseLocation, useMyLocation, refresh: () => load(location) };
}
