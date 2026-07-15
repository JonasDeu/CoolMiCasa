/** Shared domain types for the floor-plan document and weather model. */

export type Side = "N" | "E" | "S" | "W";

export interface LatLon {
  name: string;
  lat: number;
  lon: number;
}

export interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Last known indoor temperature, °C. Only trusted as a reading when `measured` is true. */
  temp: number;
  /** True = `temp` is a real thermometer reading. False/undefined = no sensor, estimate it. */
  measured?: boolean;
  /** Measured indoor relative humidity from a hygrometer, %. Null/undefined = no hygrometer. */
  rh?: number | null;
  /** Per-room comfort target, °C. Null/undefined falls back to the document default. */
  target?: number | null;
  /** Per-room humidity ceiling, % RH. Null/undefined = no target (humidity has no document default). */
  rhTarget?: number | null;
  /** "Cool this one first" — biases airflow routing and fan placement toward this room. */
  priority?: boolean;
}

/** A window opening on one wall of a room. Named WindowItem to avoid the DOM `Window`. */
export interface WindowItem {
  id: string;
  roomId: string;
  side: Side;
  /** Position along the wall, 0..1. */
  pos: number;
  /** Width on the wall, in canvas px. */
  len: number;
  /** Has a blind/curtain/shade fitted. */
  shade: boolean;
  /** Outdoor temp measured directly in front of this window, or null to use the area forecast. */
  temp: number | null;
  /** Outdoor relative humidity in front of this window, %, or null to use the area forecast. */
  rh?: number | null;
  /** Sill height above floor, metres. */
  sill?: number | null;
  /** Glass height, metres. */
  winH?: number | null;
  /**
   * How the window opens: "full" swings/slides wide open; "tilt" is the German
   * *gekippt* mode where only the top edge tilts inward, letting a fraction of the
   * airflow through. Null/undefined = "full" (keeps old saved windows working).
   */
  opening?: "full" | "tilt" | null;
  /**
   * Current sash state, only consulted when the window is LOCKED
   * (`allowOverwrite === false`). Undefined = open, so app-managed windows and old
   * saved windows are unaffected.
   */
  open?: boolean;
  /**
   * May the plan recommend opening/closing this window? Undefined/true = yes, the
   * app manages it hour-by-hour (the core feature). False locks it to `open`: the
   * advice respects that state and never tells you to change it.
   */
  allowOverwrite?: boolean;
}

export interface Door {
  id: string;
  roomA: string;
  roomB: string;
  x: number;
  y: number;
  open: boolean;
  /**
   * May the plan recommend flipping this door? Undefined/false = no, the advice and
   * fan plan respect the open/closed state you drew (no "open it!" nags, no fan aimed
   * through a shut door). True lets the app suggest opening/closing it for the breeze.
   */
  allowOverwrite?: boolean;
}

/** How heavy the building fabric is — sets how long a cool spell must last to matter. */
export type ThermalMass = "light" | "medium" | "heavy";

/** Rough airflow class of a fan — sets how hard the plan leans on it to move air. */
export type FanSize = "small" | "medium" | "large";

/** One portable fan the user owns, listed individually so each can carry its own size. */
export interface Fan {
  id: string;
  size: FanSize;
}

/** The full persisted floor-plan + settings document. */
export interface Doc {
  location: LatLon | null;
  northDeg: number;
  /** Default comfort target, °C — used for any room without its own `target`. */
  comfort: number;
  /** Ceiling height, metres (drives the stack effect). */
  ceilingH: number;
  /** The portable fans the user owns, each with its own size/airflow class. */
  fans: Fan[];
  /** Can the user seal a fan into a window opening? Most cheap fans can't. */
  canSealFan: boolean;
  /** Building thermal mass — light (drywall/timber) reacts fast, heavy (masonry) is sluggish. */
  mass: ThermalMass;
  /** Quick-start indoor temperature, °C, used for the headline/timeline when no rooms are drawn yet. */
  quickIndoorTemp?: number | null;
  rooms: Room[];
  windows: WindowItem[];
  doors: Door[];
}

export interface SunPos {
  /** Compass azimuth from North, degrees clockwise. */
  azimuth: number;
  /** Altitude above horizon, degrees. */
  altitude: number;
}

export interface Hour {
  iso: string;
  hour: number;
  date: Date;
  temp: number;
  rh: number;
  rad: number;
  windSpd: number;
  windDir: number;
  /** Precipitation for the hour, mm. */
  precip: number;
  /** Chance of precipitation, %. */
  precipProb: number;
  sun: SunPos;
}

export interface Weather {
  tz: string;
  offset: number;
  hours: Hour[];
  nowIdx: number;
  current: {
    temp: number;
    rh: number;
    windSpd: number;
    windDir: number;
    /** Current precipitation, mm. */
    precip: number;
    isDay: number;
    sun: SunPos | null;
  };
}

/** Canvas-space 2D point. */
export interface Pt {
  x: number;
  y: number;
}

/** What the user currently has selected on the canvas. */
export type Selection =
  | { type: "room"; id: string }
  | { type: "window"; id: string }
  | { type: "door"; id: string }
  | null;

export type Tool = "select" | "room" | "window" | "door";

/** Top-level app mode: build your flat (setup) vs. read the daily plan. */
export type AppMode = "setup" | "plan";
