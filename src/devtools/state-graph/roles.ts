// How each role and flow looks and is named: one place for the graph, the legend and the detail panel.
import type { FlowKind, Role } from './flow.ts'

export const ROLE_COLOR: Record<Role, string> = {
  origin: 'var(--flow-call)',
  store: 'var(--ink)',
  verb: 'var(--flow-call)',
  engine: 'var(--flow-engine)',
  reader: 'var(--flow-data)',
  reach: 'var(--flow-engine)',
}

export const ROLE_LABEL: Record<Role, string> = {
  origin: 'called the store',
  store: 'store',
  verb: 'verb ran',
  engine: 'engine ran',
  reader: 're-renders (reads new data)',
  reach: 'loaded by what ran',
}

export const FLOW_COLOR: Record<FlowKind, string> = {
  call: 'var(--flow-call)',
  engine: 'var(--flow-engine)',
  data: 'var(--flow-data)',
  reject: 'var(--flow-reject)',
}

/** A light fill of a role colour over the panel (no raw hex: a mix of two tokens). */
export const tint = (color: string, percent = 9) => `color-mix(in srgb, ${color} ${percent}%, var(--panel))`

export const fmtMs = (ms: number) => (ms < 0.05 ? '<0.1 ms' : ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`)

export const fmtTime = (at: number) => {
  const d = new Date(at)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}

/** Args in one short line, for labels: JSON without the quotes around keys. */
export const fmtArgs = (args: unknown[]) =>
  args.map((a) => (a === undefined ? 'undefined' : JSON.stringify(a)?.replace(/"(\w+)":/g, '$1:') ?? String(a))).join(', ')
