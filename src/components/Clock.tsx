import { useEffect, useState } from "react";
import { useStore } from "../store/useStore";

const pad = (n: number) => String(n).padStart(2, "0");

/** Shows the wall-clock time at the chosen location (falls back to the device clock). */
export function Clock() {
  const weather = useStore((s) => s.weather);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

  let label: string;
  let tz = "";
  if (weather) {
    // shift the UTC instant by the location's offset, then read its UTC wall clock
    const d = new Date(now + weather.offset * 1000);
    label = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
    tz = weather.tz;
  } else {
    const d = new Date(now);
    label = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  return (
    <div className="clock" title={tz ? `Local time · ${tz}` : "Your device time"}>
      🕑 {label}
      {tz && <span className="clock__tz">{tz}</span>}
    </div>
  );
}
