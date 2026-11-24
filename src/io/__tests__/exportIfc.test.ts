// @vitest-environment node
// (web-ifc loads its WebAssembly the Node way.) The IFC export (Decision "Model export"): read back with web-ifc, as a
// BIM tool would — the spatial tree (a storey per floor of a ×N level), each mass a space with its extruded body and its "GFit" properties, the ground as terrain on the site; Geometry, Terrain
// and All take what they say; the strings, reals and GlobalIds are STEP's.
import { beforeAll, describe, expect, it } from 'vitest'
import * as W from 'web-ifc'
import { derive } from '../../engine/derive.ts'
import type { GroundPoint, Project } from '../../model/schema.ts'
import { drawStreet } from '../../state/actions/streets.ts'
import { setTerrain } from '../../state/actions/site.ts'
import { demoProject } from '../../state/demo.ts'
import { exportIfc, ifcGuid, ifcReal, ifcString } from '../exportIfc.ts'
import type { ModelPart } from '../exportModel.ts'

const api = new W.IfcAPI()
beforeAll(async () => {
  await api.Init()
}, 60_000)

function open(p: Project, part: ModelPart = 'all') {
  return api.OpenModel(new TextEncoder().encode(exportIfc(p, derive(p), part)))
}
const count = (m: number, type: number) => api.GetLineIDsWithType(m, type).size()
const names = (m: number, type: number) => {
  const ids = api.GetLineIDsWithType(m, type)
  return Array.from({ length: ids.size() }, (_, i) => api.GetLine(m, ids.get(i)).Name.value as string)
}

/** The demo on a ground rising east, 1 m in 50. */
function onGround(): Project {
  const points: GroundPoint[] = []
  for (let x = -100; x <= 600; x += 50) for (let y = -100; y <= 400; y += 50) points.push({ x, y, z: 480 + 0.02 * x })
  return setTerrain(demoProject(), { contours: [], points })
}

describe('the IFC export', () => {
  it('the spatial tree: project, site, the option’s buildings, a storey per floor; each mass a space with its body and its properties', () => {
    const p = demoProject()
    p.buildings[0].levels[0] = { ...p.buildings[0].levels[0], repeat: 2 }
    const m = open(p, 'geometry')
    expect(count(m, W.IFCPROJECT)).toBe(1)
    expect(count(m, W.IFCSITE)).toBe(1)
    expect(names(m, W.IFCBUILDING)).toEqual(['Building 1'])
    expect(names(m, W.IFCBUILDINGSTOREY)).toEqual(['L1 (1 of 2)', 'L1 (2 of 2)'])
    expect(count(m, W.IFCSPACE)).toBe(p.masses.length * 2)
    expect(count(m, W.IFCGEOGRAPHICELEMENT)).toBe(0)

    let meshes = 0
    api.StreamAllMeshesWithTypes(m, [W.IFCSPACE], (mesh) => {
      meshes++
      expect(mesh.geometries.size()).toBe(1)
    })
    expect(meshes).toBe(p.masses.length * 2)

    const props = api.GetLineIDsWithType(m, W.IFCPROPERTYSINGLEVALUE)
    const values = new Map(Array.from({ length: props.size() }, (_, i) => api.GetLine(m, props.get(i))).map((v) => [v.Name.value, v.NominalValue.value]))
    expect(values.get('Program')).toBeTruthy()
    expect(values.get('Building')).toBe('Building 1')
    expect(p.programs.map((g) => g.name)).toContain(api.GetLine(m, api.GetLineIDsWithType(m, W.IFCSPACE).get(0)).LongName.value)
    api.CloseModel(m)
  })

  it('a street drawn by its edge writes its 0 side as a length that may be 0, and opens (PE.1 review)', () => {
    const p = drawStreet(demoProject({ streets: false, southStreet: false }), 'o1', [{ x: 0, y: 0 }, { x: 80, y: 0 }], undefined, 8, undefined, { edges: { left: 0, right: 8 } })!.project
    const text = exportIfc(p, derive(p), 'all')
    expect(text).toMatch(/'Left',\$,IFCNONNEGATIVELENGTHMEASURE\(0\.?\)/)
    expect(text).not.toMatch(/IFCPOSITIVELENGTHMEASURE\(0\.?\)/)
    const m = open(p, 'all')
    const props = api.GetLineIDsWithType(m, W.IFCPROPERTYSINGLEVALUE)
    const left = Array.from({ length: props.size() }, (_, i) => api.GetLine(m, props.get(i))).find((v) => v.Name.value === 'Left')
    expect(left?.NominalValue.value).toBe(0)
    api.CloseModel(m)
  })

  it('a street’s lanes: Lanes as a label of their widths and LaneCount as a count (PE.2)', () => {
    const p = drawStreet(demoProject({ streets: false, southStreet: false }), 'o1', [{ x: 0, y: 0 }, { x: 80, y: 0 }], undefined, 10.5)!.project
    const text = exportIfc(p, derive(p), 'all')
    expect(text).toContain("'Lanes',$,IFCLABEL('3.5 3.5 3.5')")
    expect(text).toContain("'LaneCount',$,IFCCOUNTMEASURE(3.)")
    const m = open(p, 'all')
    const props = api.GetLineIDsWithType(m, W.IFCPROPERTYSINGLEVALUE)
    const all = Array.from({ length: props.size() }, (_, k) => api.GetLine(m, props.get(k)))
    expect(all.find((v) => v.Name.value === 'Lanes')?.NominalValue.value).toBe('3.5 3.5 3.5')
    expect(all.find((v) => v.Name.value === 'LaneCount')?.NominalValue.value).toBe(3)
    api.CloseModel(m)
  })

  it('Terrain: the ground as it is and graded on the site, no buildings; All: both, the storeys on the platforms', () => {
    const p = onGround()
    const terrain = open(p, 'terrain')
    expect(names(terrain, W.IFCGEOGRAPHICELEMENT)).toEqual(['Ground', 'Graded ground'])
    expect(count(terrain, W.IFCBUILDING)).toBe(0)
    let corners = 0
    api.StreamAllMeshes(terrain, (mesh) => {
      const g = api.GetGeometry(terrain, mesh.geometries.get(0).geometryExpressID)
      corners += g.GetVertexDataSize()
    })
    expect(corners).toBeGreaterThan(0)
    api.CloseModel(terrain)

    const all = open(p, 'all')
    expect(count(all, W.IFCGEOGRAPHICELEMENT)).toBe(2)
    expect(count(all, W.IFCSPACE)).toBe(p.masses.length)
    const storey = api.GetLine(all, api.GetLineIDsWithType(all, W.IFCBUILDINGSTOREY).get(0))
    expect(storey.Elevation.value).toBeGreaterThan(478)
    expect(storey.Elevation.value).toBeLessThan(490)
    api.CloseModel(all)
  })

  it('the site keeps its latitude and longitude', () => {
    const p = { ...demoProject() }
    p.site = { ...p.site, geo: { lat: 13.8236439, lon: -89.2771914, north: 0 } }
    const m = open(p, 'geometry')
    const site = api.GetLine(m, api.GetLineIDsWithType(m, W.IFCSITE).get(0))
    // 13° 49′ 25.118040″ N, 89° 16′ 37.889040″ W: all of one sign
    expect(site.RefLatitude.value).toEqual([13, 49, 25, 118040])
    expect(site.RefLongitude.value).toEqual([-89, -16, -37, -889040])
    api.CloseModel(m)
  })

  it('STEP’s strings, reals and GlobalIds', () => {
    expect(ifcString("Bob's \\ bay")).toBe("'Bob''s \\\\ bay'")
    expect(ifcString('Almacén')).toBe("'Almac\\X2\\00E9\\X0\\n'")
    expect([ifcReal(3), ifcReal(-0), ifcReal(1.25), ifcReal(1e-7)]).toEqual(['3.', '0.', '1.25', '0.'])
    const a = ifcGuid('p:mass:m1')
    expect(a).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/)
    expect(ifcGuid('p:mass:m1')).toBe(a)
    expect(ifcGuid('p:mass:m2')).not.toBe(a)
  })
})
