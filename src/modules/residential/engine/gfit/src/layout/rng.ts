/** Seeded xorshift32: the same numbers for the same seed, everywhere (layouts must be reproducible). */
export const rng = (seed: number) => {
  let s = (seed * 2654435761) >>> 0 || 1
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}
