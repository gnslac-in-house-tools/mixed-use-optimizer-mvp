// Where a floating box goes so it stays inside the window (pure). Shared by the right-click menu and the menus of the bars.
export interface Point {
  x: number
  y: number
}
export interface Size {
  width: number
  height: number
}

/** `want` when the box fits; on an axis where it does not, the flipped position when `flip` gives one and it fits,
 *  else the position shifted to stay inside; never less than `margin`. */
export function placeInWindow(
  want: Point,
  size: Size,
  win: Size,
  flip: { x?: number; y?: number } = {},
  margin = 4,
): Point {
  const axis = (w: number, len: number, room: number, f?: number) => {
    const fits = (p: number) => p >= margin && p + len <= room - margin
    if (fits(w)) return w
    if (f !== undefined && fits(f)) return f
    return Math.max(margin, Math.min(w, room - margin - len))
  }
  return { x: axis(want.x, size.width, win.width, flip.x), y: axis(want.y, size.height, win.height, flip.y) }
}
