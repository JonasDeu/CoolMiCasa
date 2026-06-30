let counter = 1;

/** Short, collision-resistant id for rooms/windows/doors. */
export function uid(): string {
  return "x" + counter++ + "-" + Math.floor(performance.now()).toString(36);
}
