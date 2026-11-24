// A warehouse type's steps and their locks (Decisions "Warehouse type", "Free steps"), pure. Any step is edited at any
// time, in any order: a lock is the designer's mark that a step is checked, never a gate. Editing a step (by its
// fields, on the plan, from the Brief) takes its lock away and sends the later locked ones to lock again: their
// settings stay, the designer checks each against the change and locks it again.
import { WAREHOUSE_STEPS, type HallElement, type WarehouseStep, type WarehouseType } from '../../../model/schema.ts'

/** A step's state: open (not locked), locked (checked), or to lock again (locked, then an earlier one changed). */
export type StepStatus = 'open' | 'locked' | 'again'

/** The step to show first: the first one not locked; null when all six are. */
export function openStep(t: Pick<WarehouseType, 'locks'>): WarehouseStep | null {
  return WAREHOUSE_STEPS.find((s) => t.locks?.[s] !== 'locked') ?? null
}

export function stepStatus(t: Pick<WarehouseType, 'locks'>, step: WarehouseStep): StepStatus {
  return t.locks?.[step] ?? 'open'
}

/** Its step number, from 1. */
export const stepNumber = (step: WarehouseStep): number => WAREHOUSE_STEPS.indexOf(step) + 1

/** A step locked (checked), whatever the others are; one locked already: the same type. */
export function lockStep<T extends WarehouseType>(t: T, step: WarehouseStep): T {
  if (t.locks?.[step] === 'locked') return t
  return { ...t, locks: { ...t.locks, [step]: 'locked' } }
}

/**
 * A step opened, as editing it opens it: its lock gone, the later locked ones to lock again (those to lock again
 * stay so); nothing to change: the same type.
 */
export function reopenStep<T extends WarehouseType>(t: T, step: WarehouseStep): T {
  const at = WAREHOUSE_STEPS.indexOf(step)
  const locks: NonNullable<WarehouseType['locks']> = {}
  for (const [i, s] of WAREHOUSE_STEPS.entries()) {
    const l = t.locks?.[s]
    if (i === at || !l) continue
    locks[s] = i > at ? 'again' : l
  }
  if (JSON.stringify(locks) === JSON.stringify(t.locks ?? {})) return t
  if (Object.keys(locks).length) return { ...t, locks }
  const { locks: _, ...rest } = t
  return rest as T
}

/** What a step's figures change: any of its fields; the elements as their whole list. */
export type StepPatch = {
  grid: Partial<WarehouseType['grid']>
  hall: Partial<WarehouseType['hall']>
  columns: Partial<WarehouseType['columns']>
  envelope: Partial<WarehouseType['envelope']>
  morphology: Partial<WarehouseType['morphology']>
  elements: HallElement[]
}
