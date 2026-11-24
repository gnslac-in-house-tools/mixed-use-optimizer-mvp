// Whether two pieces of data hold the same thing (QF.4: the read-back check of Save compares the copy this browser kept
// with the project in memory). Order of keys does not matter (a project read through its schema comes back with its
// keys in the schema's order), a key whose value is undefined is a key that is not there (JSON drops it), and -0 is 0
// (JSON writes it so). Everything else must be equal, to the last number. Pure.

export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameData(x, b[i]))
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  const keys = (o: Record<string, unknown>) => Object.keys(o).filter((k) => o[k] !== undefined)
  const kx = keys(x)
  return kx.length === keys(y).length && kx.every((k) => k in y && sameData(x[k], y[k]))
}
