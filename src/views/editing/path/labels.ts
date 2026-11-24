// The names the path handles give what they drag, for the typed dimension's command line (Phase PE.1 task 10).
import type { Ref } from '../../../kinds/index.ts'

/** What a path is called: "Street" or "Existing street". */
export const pathName = (ref: Ref): string => (ref.kind === 'existing-road' ? 'Existing street' : 'Street')

/** "Street · node 2". */
export const nodeName = (ref: Ref, i: number): string => `${pathName(ref)} · node ${i + 1}`

/** "Street · stretch 2". */
export const stretchName = (ref: Ref, k: number): string => `${pathName(ref)} · stretch ${k + 1}`

/** "Street · stretch 2 · lanes" (Phase PE.2). */
export const lanesName = (ref: Ref, k: number): string => `${stretchName(ref, k)} · lanes`

/** "Street · stretch 2 · lane line 1" (Phase PE.2): `j` counts from 0 along the stretch's lanes, left to right. */
export const lineName = (ref: Ref, k: number, j: number): string => `${stretchName(ref, k)} · lane line ${j + 1}`

/** "Street · stretch 2 · left side". */
export const sideName = (ref: Ref, k: number, side: 'left' | 'right'): string => `${stretchName(ref, k)} · ${side} side`
