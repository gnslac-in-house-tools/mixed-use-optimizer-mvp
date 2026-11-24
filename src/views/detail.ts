// How much the views draw (Phase S.2, Decision "Stress test views"; Practiko's *Nivel de detalle*, `vistas/planta/
// detalle.ts`): one level for the whole app, read by the plan, the 3D and Compare. It changes what is drawn, never a
// figure. View state, not in the Project or the history; the app opens on Presentation every time (Decision "Ghosted
// detail"; the user: "make Presentation the one on by default").
//   schematic     the masses and the roads
//   ghosted       as Presentation, the masses see-through (was Design: the user: "change Design for Ghosted, the same
//                 as Presentation but with transparencies")
//   presentation  also the truck courts, the parking, the docks, the labels and the programs' hatches; in 3D the
//                 roads, the courts, the parking, the docks' doors (and their faces on the platforms), the gates and
//                 the shadows (Decision "Fixtures in 3D")
import { create } from 'zustand'

export const DETAILS = [
  { key: 'schematic', label: 'Schematic', title: 'The masses and the roads' },
  { key: 'ghosted', label: 'Ghosted', title: 'As Presentation, the masses see-through: what is under and behind them shows' },
  {
    key: 'presentation',
    label: 'Presentation',
    title: 'Also the truck courts, the parking, the docks, the labels and the programs’ hatches; in 3D the roads, the courts, the parking, the dock doors, the gates and the shadows',
  },
] as const

export type Detail = (typeof DETAILS)[number]['key']

/** What the app opens with. */
export const DEFAULT_DETAIL: Detail = 'ghosted' // mixed-use-mvp: Ghosted by default (the user), so the interiors read

export const useDetail = create<{ detail: Detail; setDetail(d: Detail): void }>()((set) => ({
  detail: DEFAULT_DETAIL,
  setDetail: (detail) => set({ detail }),
}))

/** Does it draw everything (the courts, the docks, the labels, the hatches, the paving and the shadows)? */
export const drawsAll = (detail: Detail): boolean => detail !== 'schematic'

/** Are the masses see-through? (Ghosted) */
export const seeThrough = (detail: Detail): boolean => detail === 'ghosted'
