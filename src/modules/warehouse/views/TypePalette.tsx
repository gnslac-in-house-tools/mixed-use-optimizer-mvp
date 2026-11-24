// The warehouse types' drag (Decision "Warehouse layout": "a palette of the warehouse types, as the Brief's program chips"): a card of the
// Blocks tab (BlocksPanel.tsx), dragged onto the plan or the 3D, a copy of its type stands where it is dropped (a click only picks it, Phase AS.4 task 6; *Place*, in its menu, puts one in the
// middle of the buildable area). The chips of the Brief tab went with that tab (Phase AS.3: the Blocks tab is where the types are); what stays is the
// drag's data type, which the plan and the 3D read.
import type { DragEvent } from 'react'

/** The drag's data type: the plan places a copy where it is dropped. */
export const TYPE_MIME = 'application/x-gfit-warehouse-type'

/** Is it a type's drag? (While dragging, browsers show only the types, not the data.) */
export const isTypeDrag = (e: DragEvent): boolean => Array.from(e.dataTransfer?.types ?? []).includes(TYPE_MIME)
