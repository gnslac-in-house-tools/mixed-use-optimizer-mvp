// What Properties says of a street's or an existing street's width (Phase PE.1 task 11, Decision "Width by hand"): a read-out, never a field (the pills
// set it). One pair of sides for the whole path: "8 m" when its two sides are equal, "2 + 6 m" (left + right, walking the path) when they are not;
// "Varies" where its stretches differ. Its lanes read the same way (`lanesRead`, Phase PE.2).
const num = (v: number): string => `${Math.round(v * 100) / 100}`

/** The width of a path from the sides of its stretches (each walking the path). Empty: "". */
export function sidesRead(sides: { left: number; right: number }[]): string {
  if (sides.length === 0) return ''
  const [first] = sides
  if (sides.some((s) => Math.abs(s.left - first.left) > 1e-9 || Math.abs(s.right - first.right) > 1e-9)) return 'Varies'
  return Math.abs(first.left - first.right) < 1e-9 ? `${num(first.left + first.right)} m` : `${num(first.left)} + ${num(first.right)} m`
}

/**
 * What Properties says of a street's or an existing street's lanes (Phase PE.2): `lanes` is each stretch's lanes, left to right walking the path. "3 lanes · 3.5 + 3.5 + 3.5 m",
 * "1 lane · 4 m"; "Varies" where its stretches differ; empty: "".
 */
export function lanesRead(lanes: number[][]): string {
  if (lanes.length === 0) return ''
  const [first] = lanes
  if (lanes.some((l) => l.length !== first.length || l.some((x, i) => Math.abs(x - first[i]) > 1e-9))) return 'Varies'
  return `${first.length} ${first.length === 1 ? 'lane' : 'lanes'} · ${first.map(num).join(' + ')} m`
}
