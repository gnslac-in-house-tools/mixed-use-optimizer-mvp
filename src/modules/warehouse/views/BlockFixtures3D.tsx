// A placed block's level doors and patterns in the site's 3D (blockFixtures.ts): each door a panel just out of its wall,
// each pattern a thin post on it, coloured as the docks' doors (Fixtures.tsx); drawn with them (detail.ts `drawsAll`). A
// building whose eye is off has none (`massDrawn`, views/buildingView.ts). Never answers the pointer.
import { useMemo } from 'react'
import type { Id } from '../../../model/schema.ts'
import type { DerivedMass } from '../../../engine/types.ts'
import { useApp } from '../../../state/store.ts'
import type { SceneColors } from '../../../views/scene/colors.ts'
import { liftOf, useLaid } from '../../../views/scene/laid.ts'
import { massDrawn } from '../../../views/buildingView.ts'
import { useHiddenSet } from '../../../views/layers/layerView.ts'
import { useShown } from '../../../views/viewport/look.ts'
import { blockFixturesOf, PANEL, type WallPiece } from './blockFixtures.ts'

/** `option`: a Compare pane's; `masses`: the derived masses the pieces stand on. */
export function BlockFixtures3D({ masses, colors, option }: { masses: Record<Id, DerivedMass>; colors: SceneColors; option?: Id }) {
  const project = useShown((s) => s.project)
  const shownOption = useApp((s) => s.option)
  const laid = useLaid(option)
  const off = useHiddenSet()
  const { doors, marks } = useMemo(() => {
    const all = blockFixturesOf(project, masses, option ?? shownOption, (id) => liftOf(laid, id))
    // the pieces of a building whose eye is off are not in the scene
    const drawn = (x: WallPiece) => massDrawn(masses, x.massId, off)
    return { doors: all.doors.filter(drawn), marks: all.marks.filter(drawn) }
  }, [project, masses, option, shownOption, laid, off])
  if (doors.length === 0 && marks.length === 0) return null
  return (
    <group name="block-fixtures">
      {doors.map((d, i) => (
        <Piece key={`d${i}`} piece={d} depth={PANEL.thick} off={PANEL.off + PANEL.thick / 2} color={colors.door} />
      ))}
      {marks.map((d, i) => (
        <Piece key={`p${i}`} piece={d} depth={d.width} off={d.width / 2} color={colors.door} />
      ))}
    </group>
  )
}

/** A box on a wall: `depth` m across its wall's normal, its middle `off` m out of the face. */
function Piece({ piece: d, depth, off, color }: { piece: WallPiece; depth: number; off: number; color: string }) {
  // the box's x along the wall's normal; three's y turn of a plan direction (x, y) is atan2(y, x)
  const angle = Math.atan2(d.out.y, d.out.x)
  return (
    <mesh
      position={[d.at.x + d.out.x * off, d.z0 + d.height / 2, -(d.at.y + d.out.y * off)]}
      rotation={[0, angle, 0]}
      castShadow
      raycast={() => null}
      name={d.kind === 'door' ? 'level-door' : 'pattern-post'}
    >
      <boxGeometry args={[depth, d.height, d.width]} />
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  )
}
