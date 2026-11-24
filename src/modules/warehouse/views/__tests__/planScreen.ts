// The block plan's screen in jsdom (BE.9: the main plan's camera, views/plan/usePlanCamera.ts): the SVG cannot be
// measured, so it is UNMEASURED_SIZE and its viewBox says where a world point of the block's frame (m, y up) falls.
import type { Point } from '../../../../model/schema.ts'
import { UNMEASURED_SIZE } from '../../../../views/plan/camera.ts'

const viewBox = (): number[] => {
  const svg = document.querySelector('[data-warehouse-plan]')
  const vb = svg?.getAttribute('viewBox')
  if (!vb) throw new Error('the block plan has no camera yet')
  return vb.split(' ').map(Number)
}

/** The screen px of a world point. */
export function screenAt(p: Point): { clientX: number; clientY: number } {
  const [x, y, w, h] = viewBox()
  return { clientX: ((p.x - x) / w) * UNMEASURED_SIZE.w, clientY: ((-p.y - y) / h) * UNMEASURED_SIZE.h }
}

/** Screen px for `m` metres. */
export const pxFor = (m: number): number => (m / viewBox()[2]) * UNMEASURED_SIZE.w
