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
  /** Sill height above floor, metres. */
  sill?: number | null;
  /** Glass height, metres. */
  winH?: number | null;
}

export interface Door {
  id: string;
  roomA: string;
  roomB: string;
  x: number;
  y: number;
  open: boolean;
}

/** How heavy the building fabric is — sets how long a cool spell must last to matter. */
export type ThermalMass = "light" | "medium" | "heavy";

/** The full persisted floor-plan + settings document. */
export interface Doc {
  location: LatLon | null;
  northDeg: number;
  /** Default comfort target, °C — used for any room without its own `target`. */
  comfort: number;
  /** Ceiling height, metres (drives the stack effect). */
  ceilingH: number;
  /** Number of portable fans the user owns. */
  fanCount: number;
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
