import { test, expect } from 'vitest' // mixed-use-mvp patch: GIM corre Vitest sin globals
import { area, centroid, difference, inflatePath, intersection, isSimple, offset, pathLength, subPath, toShape, union } from '../src/model/geom'
import type { Ring, Shape } from '../src/model/geom'

const sq = (x0: number, y0: number, x1: number, y1: number): Ring => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
const close = (a: number, b: number, eps = 1e-3) => expect(Math.abs(a - b)).toBeLessThan(eps)

test('area of 10x10 square is 100 whatever its orientation', () => {
  close(area(toShape([sq(0, 0, 10, 10)])), 100)
  close(area(toShape([sq(0, 0, 10, 10).reverse()])), 100)
})

test('hole subtracts', () => {
  const s: Shape = toShape([sq(0, 0, 10, 10), sq(4, 4, 6, 6)])
  close(area(s), 96)
})

test('offset -1 of 10x10 is 64', () => {
  close(area(offset(toShape([sq(0, 0, 10, 10)]), -1)), 64)
})

test('offset collapse returns []', () => {
  expect(offset(toShape([sq(0, 0, 4, 4)]), -3)).toEqual([])
})

test('difference with core outside footprint removes only the overlap', () => {
  const fp = toShape([sq(0, 0, 10, 10)])
  const core = toShape([sq(8, 8, 14, 14)])
  close(area(difference(fp, core)), 96)
  close(area(intersection(fp, core)), 4)
})

test('union merges overlapping cores once', () => {
  close(area(union([toShape([sq(0, 0, 4, 4)]), toShape([sq(2, 0, 6, 4)])])), 24)
})

test('isSimple is false for a bow-tie and true for an L', () => {
  expect(isSimple([[0, 0], [10, 10], [10, 0], [0, 10]])).toBe(false)
  expect(isSimple([[0, 0], [42, 0], [42, 18], [20, 18], [20, 40], [0, 40]])).toBe(true)
  expect(isSimple([[0, 0], [1, 1]])).toBe(false)
})

test('subPath of an L has length s1 - s0', () => {
  const L: Ring = [[0, 0], [10, 0], [10, 10]]
  close(pathLength(L), 20)
  const p = subPath(L, 5, 15)
  close(pathLength(p), 10)
  expect(p[0]).toEqual([5, 0])
  expect(p[p.length - 1]).toEqual([10, 5])
})

test('inflatePath with butt ends makes a strip of the right area', () => {
  close(area(inflatePath([[0, 0], [10, 0]], 1)), 20, 1e-2)
})

test('centroid of a square is its middle', () => {
  expect(centroid(sq(0, 0, 10, 4))).toEqual([5, 2])
})

test('offset -3 of the L footprint is the mockup setback (740 m²)', () => {
  const L: Ring = [[0, 0], [42, 0], [42, 18], [20, 18], [20, 40], [0, 40]]
  close(area(offset(toShape([L]), -3)), 36 * 12 + 14 * 22)
})

test('repeated vertices do not empty a union (clipper2-js returns nothing for them)', () => {
  const HOST: Ring = [[16.618,-11.128],[17.646,-9.413],[18.479,-7.651],[18.479,-7.651],[18.479,-7.651],[20,0],[20,0],[19.905,1.947],[19.611,3.925],[19.415,4.704],[19.05,4.777],[19.532,2.354],[13.849,1.223],[12.056,1.58],[11.86,0.599],[11.89,0],[11.834,-1.158],[11.666,-2.299],[11.375,-3.462],[10.986,-4.548],[10.728,-5.094],[10.534,-6.071],[10.534,-6.071],[10.534,-6.071],[10.125,-8.125],[12.017,-10.954],[16.138,-11.773]]
  const PIECE: Ring = [[19.136,-5.815],[19.621,-3.876],[19.905,-1.947],[19.872,-2.166],[19.556,-2.228],[18.479,-7.651],[18.479,-7.651],[18.479,-7.651]]
  const u = union([[HOST], [PIECE]])
  expect(area(u)).toBeGreaterThan(area([HOST]))
  expect(area(u)).toBeLessThanOrEqual(area([HOST]) + Math.abs(area([PIECE])) + 1e-3)
})

test('two neighbours that share an edge do not overlap (clipper2-js 1.2.4 alone returns a phantom 5 m² triangle)', () => {
  const A: Ring = [[16.618, -11.128], [17.646, -9.413], [18.479, -7.651], [19.136, -5.815], [19.621, -3.876], [19.905, -1.947], [19.872, -2.166], [19.557, -2.227], [20, 0], [19.905, 1.947], [19.611, 3.925], [19.415, 4.704], [19.05, 4.777], [19.532, 2.354], [13.849, 1.223], [12.056, 1.58], [11.86, 0.599], [11.89, 0], [11.834, -1.158], [11.666, -2.299], [11.375, -3.462], [10.986, -4.548], [10.728, -5.094], [10.534, -6.071], [10.125, -8.125], [12.017, -10.954], [16.138, -11.773]]
  const C: Ring = [[14.147, -14.138], [15.456, -12.693], [16.618, -11.128], [16.138, -11.773], [12.017, -10.954], [9.644, -7.405], [8.814, -7.959], [8.414, -8.402], [7.526, -9.206], [6.599, -9.891], [5.603, -10.487], [5.577, -10.499], [5.103, -10.723], [5.654, -10.614], [6.088, -10.529], [6.294, -11.571], [9.907, -16.973]]
  expect(area(intersection([C], [A]))).toBeLessThan(0.01)
  close(area(difference([C], [A])), area([C]), 0.01)
})
