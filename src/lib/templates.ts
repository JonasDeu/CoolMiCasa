import type { Door, Room, WindowItem } from "../types";
import { uid } from "./id";

export interface TemplateData {
  rooms: Room[];
  windows: WindowItem[];
  doors: Door[];
}

export interface Template {
  id: string;
  name: string;
  blurb: string;
  build: () => TemplateData;
}

/** Quick-start floor plans so the canvas is never an intimidating blank page. */
export const TEMPLATES: Template[] = [
  {
    id: "studio",
    name: "Studio",
    blurb: "One open room with windows on two sides",
    build() {
      const main: Room = { id: uid(), name: "Studio", x: 120, y: 90, w: 300, h: 230, temp: 27 };
      return {
        rooms: [main],
        windows: [
          { id: uid(), roomId: main.id, side: "W", pos: 0.5, len: 100, shade: true, temp: null },
          { id: uid(), roomId: main.id, side: "E", pos: 0.4, len: 90, shade: true, temp: null },
        ],
        doors: [],
      };
    },
  },
  {
    id: "onebed",
    name: "One-bedroom",
    blurb: "Living, bedroom and a connecting hall",
    build() {
      const living: Room = { id: uid(), name: "Living room", x: 90, y: 80, w: 250, h: 200, temp: 27 };
      const bed: Room = { id: uid(), name: "Bedroom", x: 90, y: 300, w: 250, h: 170, temp: 26 };
      const hall: Room = { id: uid(), name: "Hallway", x: 350, y: 120, w: 120, h: 350, temp: 26 };
      return {
        rooms: [living, bed, hall],
        windows: [
          { id: uid(), roomId: living.id, side: "W", pos: 0.5, len: 100, shade: true, temp: null },
          { id: uid(), roomId: bed.id, side: "W", pos: 0.5, len: 90, shade: true, temp: null },
          { id: uid(), roomId: hall.id, side: "E", pos: 0.5, len: 80, shade: true, temp: null },
        ],
        doors: [
          { id: uid(), roomA: living.id, roomB: hall.id, x: 348, y: 200, open: true },
          { id: uid(), roomA: bed.id, roomB: hall.id, x: 348, y: 360, open: true },
        ],
      };
    },
  },
  {
    id: "twobed",
    name: "Two-bedroom",
    blurb: "Living, bedroom, kitchen and hall — the classic flat",
    build() {
      const living: Room = { id: uid(), name: "Living room", x: 90, y: 70, w: 260, h: 200, temp: 27 };
      const bed: Room = { id: uid(), name: "Bedroom", x: 90, y: 300, w: 200, h: 170, temp: 26 };
      const hall: Room = { id: uid(), name: "Hallway", x: 360, y: 120, w: 120, h: 330, temp: 26 };
      const kitchen: Room = { id: uid(), name: "Kitchen", x: 490, y: 120, w: 200, h: 150, temp: 28 };
      return {
        rooms: [living, bed, hall, kitchen],
        windows: [
          { id: uid(), roomId: living.id, side: "W", pos: 0.5, len: 90, shade: true, temp: null },
          { id: uid(), roomId: living.id, side: "N", pos: 0.5, len: 80, shade: true, temp: null },
          { id: uid(), roomId: bed.id, side: "W", pos: 0.5, len: 80, shade: true, temp: null },
          { id: uid(), roomId: kitchen.id, side: "E", pos: 0.5, len: 80, shade: true, temp: null },
        ],
        doors: [
          { id: uid(), roomA: living.id, roomB: hall.id, x: 355, y: 200, open: true },
          { id: uid(), roomA: hall.id, roomB: kitchen.id, x: 485, y: 200, open: true },
          { id: uid(), roomA: living.id, roomB: bed.id, x: 190, y: 285, open: true },
        ],
      };
    },
  },
];

export function templateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
