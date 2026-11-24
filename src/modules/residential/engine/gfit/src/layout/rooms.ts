// Room WFC (port of the unit room solver, rooms only): a programme of room types becomes the rooms of one unit.
// The unit rectangle w × d is cut into two strips along its width — the facade strip (rooms that need daylight,
// y up to d) and the interior strip (wet rooms and the hall, y from 0, the corridor side). Each strip is collapsed
// room by room on a 0.3 m grid: a room's domain is [min, max] slots from its min width and area range at the
// strip depth; forward checking keeps the rest fillable; the next room is drawn by weighted roulette (×2 next to
// a room it likes, ×2 under one across the strips, never two halls in a row). A hall absorbs what the interior
// strip has left and the entry sits on it. A layout that fails the checks is thrown away and the seed moves on.
import type { RoomKind, RoomType } from '../model/program'
import { rng } from './rng'

const Q = 0.3
export type Rect = [number, number, number, number]
export interface LocalRoom { kind: RoomKind; name: string; r: Rect }
export interface Generated { rooms: LocalRoom[]; entry: number; fail?: string; attempts: number }

type Slotted = { rt: RoomType; lo: number; hi: number; filler?: boolean }
const HALL: RoomType = { id: 'hall', name: 'Hall', kind: 'hall', area: [0, 1e9], minWidth: 1.2, facade: 'no', wet: false, near: ['living'], w: 1.5, d: 3 }

function domain(rt: RoomType, depth: number): Slotted {
  const lo = Math.max(rt.minWidth, rt.area[0] / depth)
  const hi = Math.max(lo, rt.area[1] / depth)
  const L = Math.ceil(lo / Q - 1e-6)
  return { rt, lo: L, hi: Math.max(L, Math.floor(hi / Q + 1e-6)) }
}
const nearOf = (x: RoomType, y: RoomType) => x.near.includes(y.kind) || y.near.includes(x.kind)

function collapse(items: Slotted[], slots: number, r: () => number, above?: (x: number) => RoomType | null): { rt: RoomType; x0: number; k: number }[] | null {
  const left = [...items]
  const out: { rt: RoomType; x0: number; k: number }[] = []
  let x = 0
  while (left.length) {
    const prev = out.at(-1)?.rt
    const weights = left.map((it) => {
      let w = 1
      if (prev && nearOf(prev, it.rt)) w *= 2
      if (prev?.kind === 'hall' && it.rt.kind === 'hall') w = 0
      const up = above?.((x + 0.5) * Q)
      if (up && nearOf(up, it.rt)) w *= 2
      if (it.filler && out.length === 0) w *= 0.5
      // the hall goes under the closed rooms, so their doors open onto it
      if (it.rt.kind === 'hall' && up && CLOSED.includes(up.kind)) w *= 3
      return w
    })
    const sum = weights.reduce((a, b) => a + b, 0)
    if (sum <= 0) return null
    let t = r() * sum
    let i = 0
    while (i < weights.length - 1 && (t -= weights[i]) > 0) i++
    const it = left.splice(i, 1)[0]
    const rem = slots - x
    const restLo = left.reduce((a, b) => a + b.lo, 0)
    const restHi = left.reduce((a, b) => a + b.hi, 0)
    const lo = Math.max(it.lo, rem - restHi)
    const hi = Math.min(it.hi, rem - restLo)
    if (lo > hi) return null
    const k = left.length ? lo + Math.floor(r() * (hi - lo + 1)) : rem
    if (k < it.lo || k > it.hi) return null
    out.push({ rt: it.rt, x0: x, k })
    x += k
  }
  return x === slots ? out : null
}

const minFacade = (fd: number, rs: RoomType[]) => rs.reduce((a, rt) => a + domain(rt, fd).lo, 0)
function depths(d: number, want: number): number[] {
  const out: number[] = []
  for (let fd = 2.4; fd <= d - 1.5 + 1e-6; fd += Q) out.push(+fd.toFixed(2))
  return out.sort((a, b) => Math.abs(a - want) - Math.abs(b - want))
}

/** the narrowest shell (m) whose facade strip takes the programme's daylight rooms, at unit depth d */
export function minWidth(rooms: RoomType[], d: number): number {
  const facade = rooms.filter((r) => r.facade === 'required')
  const ds = depths(d, d / 2)
  if (!ds.length) return Infinity
  return Math.min(...ds.map((fd) => minFacade(fd, facade))) * Q
}

const LIT: RoomKind[] = ['living', 'dining', 'master', 'bed', 'study']
const CLOSED: RoomKind[] = ['bed', 'master', 'study', 'bath', 'halfbath', 'laundry', 'storage']
const OPEN: RoomKind[] = ['hall', 'living', 'dining', 'kitchen']
function shares(a: Rect, b: Rect): number {
  if (Math.abs(a[2] - b[0]) < 1e-6 || Math.abs(a[0] - b[2]) < 1e-6) return Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
  if (Math.abs(a[3] - b[1]) < 1e-6 || Math.abs(a[1] - b[3]) < 1e-6) return Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]))
  return 0
}

/** daylight in habitable rooms, a door for every closed room, every room at least its min width */
function check(rooms: LocalRoom[], types: RoomType[], d: number): string | null {
  for (const r of rooms) if (LIT.includes(r.kind) && Math.abs(r.r[3] - d) > 1e-6) return 'no daylight in ' + r.name
  for (const r of rooms) {
    if (!CLOSED.includes(r.kind)) continue
    const bathLike = r.kind === 'bath' || r.kind === 'halfbath'
    const ok = rooms.some((o) => o !== r && (OPEN.includes(o.kind) || (bathLike && (o.kind === 'bed' || o.kind === 'master'))) && shares(r.r, o.r) >= 0.85 + 0.35)
    if (!ok) return 'no door to ' + r.name
  }
  for (const r of rooms) {
    const t = types.find((x) => x.name === r.name)
    if (t && Math.min(r.r[2] - r.r[0], r.r[3] - r.r[1]) < t.minWidth - 1e-6) return r.name + ' narrower than ' + t.minWidth + ' m'
  }
  return null
}

export function generateRooms(w: number, d: number, rooms: RoomType[], seed: number): Generated {
  if (!rooms.length) return { rooms: [], entry: w / 2, fail: 'the programme has no rooms', attempts: 0 }
  // whole slots, rounded down: an off-grid width only ever stretches rooms
  const W = Math.floor(w / Q + 1e-6)
  const facade = rooms.filter((r) => r.facade === 'required')
  const pref = rooms.filter((r) => r.facade === 'preferred')
  const inner = rooms.filter((r) => r.facade === 'no')
  const want = facade.length ? facade.reduce((a, r) => a + r.d, 0) / facade.length : d / 2
  const ds = depths(d, want)
  // facade depths that leave both strips fillable, closest to the rooms' own depths first
  // both strips at least as deep as the min width of what may land in them (preferred rooms can go either way)
  const deepF = Math.max(0, ...facade.map((r) => r.minWidth), ...pref.map((r) => r.minWidth)), deepI = Math.max(1.2, ...inner.map((r) => r.minWidth), ...pref.map((r) => r.minWidth))
  const ok = ds.filter((x) => x >= deepF - 1e-6 && d - x >= deepI - 1e-6 && minFacade(x, facade) <= W && minFacade(d - x, inner) <= W)
  const fd0 = ok[0] ?? ds.find((x) => minFacade(x, facade) <= W)
  if (fd0 == null) {
    const need = (Math.min(...(ds.length ? ds : [d]).map((x) => minFacade(x, facade))) * Q).toFixed(1)
    return { rooms: [], entry: w / 2, fail: `the facade rooms need ${need} m of width; the unit has ${w.toFixed(1)} m`, attempts: 0 }
  }
  let reason = 'no layout passed the unit checks'
  for (let attempt = 0; attempt < 40; attempt++) {
    const fd = ok.length ? ok[attempt % Math.min(3, ok.length)] : fd0
    const id = d - fd
    const r = rng(seed * 7919 + attempt * 104729 + 17)
    const top = [...facade]
    const bottom = [...inner]
    for (const p of pref) (minFacade(fd, [...top, p]) <= W && r() < 0.6 ? top : bottom).push(p)
    const topItems = top.map((rt) => domain(rt, fd))
    const topOut = collapse(topItems, W, r) ?? collapse(topItems.map((it) => ({ ...it, hi: W })), W, r)
    if (!topOut) { reason = 'the facade rooms do not fill the facade width'; continue }
    const above = (x: number) => topOut.find((p) => x >= p.x0 * Q && x < (p.x0 + p.k) * Q)?.rt ?? null
    const inItems: Slotted[] = bottom.map((rt) => domain(rt, id))
    // a hall takes what the interior strip has left; a strip too tight for one (a studio) enters through an open room
    const hallLo = Math.ceil(HALL.minWidth / Q)
    if (inItems.reduce((a, b) => a + b.lo, 0) + hallLo <= W) inItems.push({ rt: HALL, lo: hallLo, hi: W, filler: true })
    // with no hall, an open room (the kitchen) stretches to close the strip
    const inOut = collapse(inItems, W, r, above) ?? collapse(inItems.map((it) => (OPEN.includes(it.rt.kind) ? { ...it, hi: W } : it)), W, r, above)
    if (!inOut) { reason = 'the interior rooms do not fit the width'; continue }
    const out: LocalRoom[] = [
      ...topOut.map((p) => ({ kind: p.rt.kind, name: p.rt.name, r: [p.x0 * Q, id, (p.x0 + p.k) * Q, d] as Rect })),
      ...inOut.map((p) => ({ kind: p.rt.kind, name: p.rt.name, r: [p.x0 * Q, 0, (p.x0 + p.k) * Q, id] as Rect })),
    ]
    // a non-0.3 width (the band scales its slots) stretches the last column
    const sx = w / (W * Q)
    if (Math.abs(sx - 1) > 1e-9) for (const o of out) { o.r[0] *= sx; o.r[2] *= sx }
    const bad = check(out, rooms, d)
    if (bad) { reason = bad; continue }
    const door = inOut.find((p) => p.rt.kind === 'hall') ?? inOut.find((p) => OPEN.includes(p.rt.kind))
    if (!door) { reason = 'no hall or open room for the entry'; continue }
    return { rooms: out, entry: (door.x0 + door.k / 2) * Q * sx, attempts: attempt + 1 }
  }
  return { rooms: [], entry: w / 2, fail: reason, attempts: 40 }
}
