// What From zero's chapters share: the block the tutorial makes ("Tutorial warehouse") and its copies on the site.
import type { Id, WarehouseType } from '../../../model/schema.ts'
import { useApp } from '../../../state/store.ts'
import { renameType } from '../../../modules/warehouse/views/commands.ts'

export const TUTORIAL_BLOCK = 'Tutorial warehouse'

/** The tutorial's block type. */
export const tutorialType = (): WarehouseType | undefined => useApp.getState().project.warehouseTypes?.find((t) => t.name === TUTORIAL_BLOCK)
export const tutorialTypeId = (): Id | undefined => tutorialType()?.id

/** The block the person began with + New block made the tutorial's (named "Tutorial warehouse"); one already: nothing. */
export function adoptBlock(): void {
  if (tutorialType()) return
  const last = useApp.getState().project.warehouseTypes?.at(-1)
  if (last) renameType(last.id, TUTORIAL_BLOCK)
}

/** The option in view's copies of the tutorial's block, by building id, in the order placed. */
export function tutorialCopies(): Id[] {
  const { project: p, option } = useApp.getState()
  const t = tutorialTypeId()
  const ids = p.options.find((o) => o.id === option)?.buildingIds ?? []
  return p.buildings.filter((b) => ids.includes(b.id) && b.warehouse?.type === t).map((b) => b.id)
}

/** The hall of the tutorial block's first copy in the option in view. */
export function tutorialHall(): Id | undefined {
  const { project: p } = useApp.getState()
  const b = p.buildings.find((x) => x.id === tutorialCopies()[0])
  const levels = new Set(b?.levels.map((l) => l.id) ?? [])
  return p.masses.find((m) => m.part === 'hall' && levels.has(m.levelId))?.id
}
