// Shim (no es de GFit): la forma mínima del `State` de GFit que usan `removeUnitType` y `removeRoomType` en
// `program.ts`. El estado completo arrastra programas, parking y vistas; el catálogo no los necesita.
import type { RoomType, SRule, UnitType } from './program'

export interface State {
  unitTypes: UnitType[]
  rooms: RoomType[]
  rules: SRule[]
  options: { buildings: { mix: Record<string, number> }[] }[]
}
