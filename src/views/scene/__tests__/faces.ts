// A test helper: which way the scene's triangles face (three.js draws a triangle's front, counter-clockwise as seen).

/** Each triangle's normal's up part, the triangles' corners nine numbers each in the scene: > 0, it faces up. */
export const ups = (p: Float32Array) =>
  Array.from({ length: p.length / 9 }, (_, k) => {
    const [ax, , az, bx, , bz, cx, , cz] = p.slice(9 * k, 9 * k + 9)
    // (b − a) × (c − a), its y
    return (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
  })
