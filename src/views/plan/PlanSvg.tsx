// The site plan: an SVG in metres, of the active level (Decision "Levels"). Layers, bottom to top: the map under the
// plan (Phase 5.4; site/MapLayer.tsx: the site's paper goes thin over it) → the site's paper → the structural grid
// across the whole view (Show's Grid; grid/GridLayer.tsx: behind every drawing) → the site's drawings (reference
// lines and parcels, Decision "Drawing layers"; site/DrawingsLayer.tsx: a click on the background near their lines picks
// one, Decision "Drawing pick"; site/drawingPick.ts) → site boundary →
// buildable area (the boundary, the buildable line, the streets, the existing roads, the gates, the
// truck courts, the lots and the street stalls each have an eye, views/layers: hidden, a layer is not drawn, picked or
// snapped to, with its handles and pills, and its figures still count) → the ground (Show's Terrain) → the levels
// below, faded → the option's other buildings, lighter (Decision "Buildings layout";
// OtherBuildings.tsx) → the level's masses (a context building's grey and dashed) → labels → the reference level, dashed → the drawing layers and parcels put On top
// (the layer tree's third toggle: DrawingsLayer again, `over`; the reference lines' layer is mounted the same two ways, Phase AS.5: the first beside the drawings, the second
// after them) → dimensions → notes (Phase AS.5) →
// handles of the selected mass (Select tool) → the active tool's layer → snap mark → the selection window. In All,
// every level's masses instead, light, to pick one (LevelLayers.tsx). With the Select tool a drag on empty ground draws
// a selection window (Decision "Multi-selection"; Shift adds to what is selected). A locked mass is seen and not picked (the
// padlock is CAD's, Phase AS.3; so is a locked street's, lot's or gate's, Phase AS.4, lockedAt.ts): its press is the background's (a window, a pan), a click on it says it is locked, and so
// does a right-click (the notice alone: no menu opens, as it would act on something else). The right-click opens the one menu of the
// app (editing/menu/, Phase AS.4) for what is picked: a mass, a street, a lot, a gate, a dimension or a drawing's line under the pointer is picked first
// (unless it is already picked: then the menu is of the whole selection); with a tool in hand it lets the tool go first. A mass whose own eye is off
// (Hide for one object) is not drawn. Its Fit is the
// drafting bar's (`planRef.ts`); a double-click on empty space fits too, as in Plaza-Practiko. A program dragged from
// the Program tab and dropped on a mass gives it that program. The brief's rules on the masses are drawn over them
// as the drafting bar's *Rules* says (Decision "Rules"; RulesLayer.tsx: the broken ones by default), and the warnings
// stand beside the masses as chips that open the Summary's Issues on theirs (Decisions "Issues on the massing" and
// "Issues, one list"; IssueMarkers.tsx).
// With Show's *Graph* on (Decision "Graph in Massing"), the level's masses are ghosts, still editable, and
// the graph is drawn over them (GraphLayer.tsx) in the rules' arcs' place. **Every step draws the same plan, and
// everything on it answers the same** (Decision "Steps change the tools"; the user: "the steps are only to change the
// tools of the top banner, not for anything of the viewport to change"): the masses (Select, handles, window, menu,
// dock marks), the site's access (Decision "Exterior circulation"; access/AccessLayer.tsx: the gates and the
// existing roads; picked, slid), the roads (circulation/RoadsLayer.tsx, over the courts
// and under the masses: a click picks one, Shift+click more, Properties shows it, its points are dragged), the stalls
// (a picked street's P pills turn a side's on or off, modules/parking/views/StreetParking.tsx), the parking lots
// (modules/parking/views/LotsLayer.tsx: a click picks one, a free one dragged moves; the picked one's handles) and the approaches. While a tool works (an access tool, Draw or Place, a file's outline to pick), the masses let the pointer
// through to it. The truck courts lie under the masses and the docked walls over them (modules/docks/views/DocksLayer.tsx); a
// selected mass that docks gets a mark beside each wall that turns its docks on or off, the filled ones dragged onto
// another wall to move them there.
// While the viewport shows a look (Decision "Specimen preview"; viewport/look.ts: an optimizer's specimen), the plan
// draws it, read only: no handles, tools, dimensions, chips, window or menu, nothing answers the pointer but the
// camera, and the design's masses are dashed over it, where they are.
// The masses are painted as in Practiko (Decision "Plan style"; planStyle.ts): their colour at 85 % over the paper, an
// ink outline, their program's hatch over it (hatches.tsx), a paper halo under the selected one, two-line labels on a
// halo that leave a mass too small for them. It
// only READS the store (project + derived) and sends edits through actions; it computes no geometry itself.
import { Fragment, useEffect, useId, useMemo, useState, type MouseEvent } from 'react'
import { massIsLocked } from '../../kinds/locked.ts'
import type { Ref } from '../../kinds/types.ts'
import type { Id } from '../../model/schema.ts'
import { bounds, centroid, type Bounds } from '../../engine/geom/polygon.ts'
import { alongBoundary } from '../../engine/circulation/streets.ts'
import { stripPieces } from '../../engine/path/strip.ts'
import type { Derived } from '../../engine/types.ts'
import { useApp } from '../../state/store.ts'
import { fillOf, isContext, massEyeOff, useBuildingView } from '../buildingView.ts'
import { BOUNDARY, BUILDABLE, LABELS } from '../layers/keys.ts'
import { useHidden } from '../layers/layerView.ts'
import { m2 } from '../format.ts'
import { pathOf } from './camera.ts'
import { startMassDrag } from './editing.ts'
import { AllLevels, LowerLevels, ReferenceLayer } from './LevelLayers.tsx'
import { LockGlyph } from './LockGlyph.tsx'
import { GroupTurn, MassHandles } from './MassHandles.tsx'
import { PathHandles } from '../editing/path/PathHandles.tsx'
import { SiteShapeHandles } from '../editing/shape/ShapeHandles.tsx'
import { massAtPoint, lockedMassAt, pickForMenu } from './massCommands.ts'
import { lockedThingAt, thingAt } from './lockedAt.ts'
import { openMenu } from '../editing/menu/open.tsx'
import { letGo, useHand } from '../tools/hand.ts'
import { useGraph } from '../graph/graphState.ts'
import { GraphLayer } from './GraphLayer.tsx'
import { HatchFill, HatchPatterns, hatchOf } from './hatches.tsx'
import { drawsAll, seeThrough, useDetail } from '../detail.ts'
import { inIsolated, useIsolate } from '../stats/isolate.ts'
import { FILL_OPACITY, HALO_PX, LABEL_PX, labelFits, SEE_THROUGH, SELECTED_PX, STROKE_PX } from './planStyle.ts'
import { IssueMarkers } from './IssueMarkers.tsx'
import { RulesLayer } from './RulesLayer.tsx'
import { OtherBuildings } from './OtherBuildings.tsx'
import { SnapMark } from './snap/SnapMark.tsx'
import { GridLayer } from './grid/GridLayer.tsx'
import { takeRequest, useGoTo } from '../viewport/goTo.ts'
import { dropOnMass, isMassDrop } from '../panels/massDrop.ts'
import { isTypeDrag, TYPE_MIME } from '../../modules/warehouse/views/TypePalette.tsx'
import { placeCopy } from '../../modules/warehouse/views/commands.ts'
import { useEditCommand } from './command/editCommand.ts'
import { DimensionField } from '../editing/dimension/DimensionField.tsx'
import { useTypedCommand } from '../editing/dimension/useTypedCommand.ts'
import { NotesLayer } from './annotations/NotesLayer.tsx'
import { ReferenceLineHandles, ReferenceLinesLayer } from './annotations/ReferenceLinesLayer.tsx'
import { DimensionsLayer } from './dimensions/DimensionsLayer.tsx'
import { usePlanRef } from './planRef.ts'
import { ToolLayer, useToolActive } from './tools/ToolLayer.tsx'
import { planPointer } from './tools/toolState.ts'
import { useDrag } from './useDrag.ts'
import { usePlanCamera } from './usePlanCamera.ts'
import { AccessLayer } from './access/AccessLayer.tsx'
import { useLooking, useShown } from '../viewport/look.ts'
import { accessToolOn, useAccessTool } from './access/accessState.ts'
import { AccessToolLayer } from './access/AccessTools.tsx'
import { CourtGaps, CourtPills, CourtsLayer, DockMarks, DocksLayer, DoorSlots } from '../../modules/docks/views/DocksLayer.tsx'
import { useCourtPick } from '../editing/shape/shapeState.ts'
import { BlockCourtHandles } from '../../modules/warehouse/views/BlockCourtHandles.tsx'
import { SiteEdgeSelect } from '../../modules/warehouse/views/SiteBlockTools.tsx'
import { BlockSiteLayer } from '../../modules/warehouse/views/BlockSiteLayer.tsx'
import { useSiteBlock } from '../../modules/warehouse/views/siteBlockState.ts'
import { RoadsLayer, StallsLayer } from './circulation/RoadsLayer.tsx'
import { ParkingPills } from '../../modules/parking/views/StreetParking.tsx'
import { LotHandles, LotsLayer } from '../../modules/parking/views/LotsLayer.tsx'
import { DrawingsLayer } from './site/DrawingsLayer.tsx'
import { ImportLayer } from './site/ImportLayer.tsx'
import { MapLayer, useMapShown } from './site/MapLayer.tsx'
import { SiteToolLayer } from './site/SiteToolLayer.tsx'
import { CutFill, PlatformMarks, TerrainLayer } from '../../modules/terrain/views/TerrainLayer.tsx'
import { CapaResidencial } from '../../modules/residential/views/CapaResidencial.tsx' // mixed-use-mvp
import { InterioresNave } from '../../modules/warehouse/views/InterioresNave.tsx' // mixed-use-mvp
import { useSiteTool } from './site/siteTools.ts'
import { importBounds, useSiteImport } from './site/importState.ts'
import { addToMix, letGoAll, pickDrawing, pickDrawingForMenu, pickedRefs, pickRefForMenu, selectBox } from './mix.ts'
import { drawingAt } from './site/drawingPick.ts'
import { useLayerView } from '../layers/layerView.ts'
import { LINE_APERTURE_PX } from './snap/move.ts'
import { LOCKED } from '../../model/picked.ts'
import { useToast } from '../layout/toast.ts'
import type { Box } from './windowSelect.ts'
import { SelectionWindow } from './SelectionWindow.tsx'

/** The street, lot, gate, dimension, reference line, note or existing road an element of the plan belongs to (what the layers mark with `data-road`, `data-lot`, `data-gate`, `data-dimension`, `data-reference-line`, `data-note`, `data-existing-road`). */
function ofElement(el: Element): Ref | null {
  // a street's hit stroke is a run's (`data-road`); the street a person picks is its `data-street-id`
  const roadEl = el.closest('[data-road]')
  const road = roadEl?.getAttribute('data-street-id') ?? roadEl?.getAttribute('data-road')
  // an existing street's hit stroke carries `existing:<id>`: the site's road, not the design's street (Phase PE.2 task 12)
  if (road?.startsWith('existing:')) return { kind: 'existing-road', id: roadEl?.closest('[data-existing-road]')?.getAttribute('data-existing-road') ?? road.slice('existing:'.length) }
  if (road) return { kind: 'street', id: road }
  const lot = el.closest('[data-lot]')?.getAttribute('data-lot')
  if (lot) return { kind: 'lot', id: lot }
  const gate = el.closest('[data-gate]')?.getAttribute('data-gate')
  if (gate) return { kind: 'gate', id: gate }
  const dimension = el.closest('[data-dimension]')?.getAttribute('data-dimension')
  if (dimension) return { kind: 'dimension', id: dimension }
  const guide = el.closest('[data-reference-line]')?.getAttribute('data-reference-line')
  if (guide) return { kind: 'reference-line', id: guide }
  const note = el.closest('[data-note]')?.getAttribute('data-note')
  if (note) return { kind: 'note', id: note }
  const existing = el.closest('[data-existing-road]')?.getAttribute('data-existing-road')
  return existing ? { kind: 'existing-road', id: existing } : null
}

/** What "fit" frames: the site, plus any mass outside it and the existing streets along its boundary. 100 × 100 m when there is nothing. */
export function contentBounds(d: Derived): Bounds {
  const outline = d.site.polygon
  const faced = outline ? d.circulation.roads.filter((r) => r.kind === 'existing' && alongBoundary(outline, r.nodePoints ?? r.points)).flatMap((r) => stripPieces(r.points, r.width).flat()) : []
  const pts = [...(outline ?? []), ...Object.values(d.masses).flatMap((m) => m.polygon), ...faced]
  return pts.length ? bounds(pts) : { minX: -50, minY: -50, maxX: 50, maxY: 50 }
}

/** How much of the plan's left the survey window covers (rem): its width and its margin. */
const SURVEY_COVERS_REM = 27

/** The page's rem in px (16 unless the user's browser says otherwise). */
const rootRem = () => (typeof document === 'undefined' ? 16 : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)

export function PlanSvg() {
  const project = useShown((s) => s.project)
  const derived = useShown((s) => s.derived)
  const looking = useLooking()
  const level = useApp((s) => s.level)
  const showAll = useApp((s) => s.showAll)
  // a mass whose own eye is off (Hide for one object, `mass:<id>`) is not drawn, picked or snapped to
  const hiddenKeys = useLayerView((s) => s.hidden)
  const masses = useMemo(() => (showAll ? [] : project.masses.filter((m) => m.levelId === level && !massEyeOff(hiddenKeys, m.id))), [project.masses, level, showAll, hiddenKeys])
  const selectedIds = useApp((s) => s.selection.massIds)
  const camera = usePlanCamera(() => {
    // a file being imported: what it brings is what to look at (Decisions "Site step layout", "Site file survey"),
    // right of the survey window over the plan's left (its 25rem and margin; found in the stress test: it hid the parcel)
    const pending = useSiteImport.getState().pending
    const b = pending && importBounds(pending)
    if (b) return pending.kind === 'survey' ? { ...b, left: SURVEY_COVERS_REM * rootRem() } : b
    return contentBounds(useApp.getState().derived)
  })
  const drag = useDrag(camera.toWorld)
  // with the Select tool, the command line types a measure for what is selected
  useEditCommand()
  // while a drag is typed (or can be corrected), the line is its: the number beside the handle and here are one
  useTypedCommand()
  // another project was opened (a .gft, a new project): frame its site
  const opened = useApp((s) => s.opened)
  const { fitContent } = camera
  useEffect(() => {
    if (opened > 0) fitContent()
    // only when a project is opened, not when fitContent's identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened])
  // a file's shapes to pick from, framed when they come or move (its units, its UTM zone)
  const framed = useSiteImport((s) => s.framed)
  useEffect(() => {
    if (framed > 0) fitContent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framed])
  // the drafting bar's Fit reaches this plan while it is mounted
  const registerPlan = usePlanRef((s) => s.register)
  useEffect(() => {
    registerPlan(fitContent)
    return () => registerPlan(null)
  }, [registerPlan, fitContent])
  // a warning's "go to": look at its mass without changing the zoom, and mark it for a moment
  const target = useGoTo((s) => s.target)
  const { centerOn } = camera
  useEffect(() => {
    if (target && takeRequest('plan', target.n)) centerOn(target.point)
    // only on a new request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.n])

  const colorBy = useBuildingView((s) => s.colorBy)
  // Detail (Phase S.2): courts, parking, docks and labels from Design on; the programs' hatches in Presentation
  const detail = useDetail((s) => s.detail)
  const labels = !useHidden(LABELS) && drawsAll(detail)
  // the site's outline and its buildable line: an eye each (the site's paper under them stays)
  const boundaryShown = !useHidden(BOUNDARY)
  const buildableShown = !useHidden(BUILDABLE)
  const designed = drawsAll(detail)
  // Ghosted: the masses see-through (Decision "Ghosted detail")
  const see = seeThrough(detail)
  // Massing's graph: the masses as ghosts under it
  // in every step (Decision "Show fixed"); where the masses answer nothing (a look) its bubbles do not drag
  const graphOn = useGraph((s) => s.graph)
  const isolated = useIsolate((s) => s.isolated)
  const ghost = graphOn
  // what answers nothing but the camera: a look's masses
  const still = looking
  // the site's tools at work (an access tool, Draw or Place, a file's outline to pick): the masses let them be
  const accessTool = useAccessTool()
  const siteTool = useSiteTool((s) => s.tool !== null)
  const importing = useSiteImport((s) => s.pending !== null)
  const siteBusy = accessTool || siteTool || importing
  const deaf = still || siteBusy

  // Masses named in an error issue get a red outline (the circulation's are warnings: no step hides one).
  const withError = useMemo(
    () => new Set(derived.issues.filter((i) => i.severity === 'error').flatMap((i) => i.massIds)),
    [derived.issues],
  )

  const px = 1 / camera.scale // one screen pixel, in metres: sizes text so it stays readable at any zoom
  // the hatches' patterns are this plan's (Compare draws more than one)
  const hatchBase = `plan${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const toolActive = useToolActive()
  const courtTool = useSiteBlock((s) => s.tool === 'court')
  const mapShown = useMapShown() && !looking
  const [dropOn, setDropOn] = useState<Id | null>(null) // the mass a program, a building or an option is dragged over
  const [box, setBox] = useState<Box | null>(null) // the selection window being drawn
  const background = camera.backgroundHandlers(
    (e) => {
      // what the design did not take: a drawing's line within the snap's line reach (Decision "Drawing pick"), only
      // with the plain pointer (no tool, no site tool, no look, not All)
      const hit =
        toolActive || deaf || showAll
          ? null
          : drawingAt(useApp.getState().project, camera.toWorld(e), LINE_APERTURE_PX * px, useLayerView.getState().hidden)
      // a locked mass is seen, not picked (the padlock is CAD's): its press is this background's, and a click on it says so
      if (!toolActive && !deaf && !showAll && (lockedMassAt(camera.toWorld(e)) || lockedThingAt(camera.toWorld(e), px))) return useToast.getState().show('info', LOCKED)
      if (hit && 'locked' in hit) return useToast.getState().show('info', LOCKED)
      if (hit) return e.shiftKey ? addToMix('drawing', hit.part) : pickDrawing(hit.part)
      if (e.shiftKey) return // Shift+click on empty ground keeps the selection, as in AutoCAD
      letGoAll()
    },
    showAll || deaf
      ? undefined
      : {
          move: setBox,
          end(b, e) {
            setBox(null)
            // every kind the box picks, a mass of a group with its group (Decisions "Groups", "Mixed selection")
            selectBox(b, e.shiftKey, px)
          },
          cancel: () => setBox(null),
        },
  )

  // the one right-click menu (Decision "One menu"): a mass not selected is picked first, with its group; the menu is the kind's, built
  // from what is picked (editing/menu/). A tool in hand lets go first, as Escape does, so no half-drawn shape stays: then it picks and opens.
  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    // All levels, a look, a file being imported: the plan answers nothing but the camera
    if (showAll || still || importing) return
    const tool = useHand.getState().tool !== 'select' || toolActive || siteBusy
    if (tool) letGo()
    const world = camera.toWorld(e)
    const target = e.target as Element
    // a placed block's truck court (Phase D.3): picked, and its own menu (Back to a rectangle); the block stays picked
    const court = target.closest('[data-block-court]')?.getAttribute('data-block-court')
    if (court && !tool) {
      const ref = { kind: 'block-court', id: court }
      useCourtPick.getState().setPick({ ref, vertex: null })
      openMenu(e, [ref], 'plan', world)
      return
    }
    const id = target.closest('[data-mass],[data-other-mass]')
    // with a tool in hand the masses let the pointer through to it: what is under the pointer is found by its place
    const massId = id?.getAttribute('data-mass') ?? id?.getAttribute('data-other-mass') ?? (tool ? massAtPoint(world) : null)
    // a locked mass is not picked: the notice says it is locked and no menu opens (the menu acts on what is picked)
    if (massId) {
      if (!pickForMenu(massId, e.altKey)) return
    } else {
      // the street, lot, gate, dimension, reference line or note under the pointer is picked first, as a mass is (a locked one: the notice alone, no menu)
      const ref = ofElement(target) ?? (tool ? thingAt(world, px) : null)
      if (ref) {
        if (!pickRefForMenu(ref)) return
      } else if (!tool && !showAll && lockedThingAt(world, px)) {
        useToast.getState().show('info', LOCKED)
        return
      } else if (!tool) {
        // a line of a drawing within reach of the pointer: its file (or layer) is picked first; a locked layer says so
        const hit = drawingAt(useApp.getState().project, world, LINE_APERTURE_PX * px, useLayerView.getState().hidden)
        if (hit && 'locked' in hit) return void useToast.getState().show('info', LOCKED)
        if (hit) pickDrawingForMenu(hit.part)
      }
    }
    openMenu(e, pickedRefs(), 'plan', world)
  }

  return (
    <div className={`relative h-full w-full ${drag.copying ? 'copying' : ''}`} onContextMenu={onContextMenu}>
      <svg
        ref={camera.svgRef}
        viewBox={camera.viewBox}
        className="h-full w-full touch-none select-none"
        role="img"
        aria-label="Site plan"
        {...background}
        onPointerMove={(e) => {
          planPointer.point = camera.toWorld(e) // for "paste at the pointer"
          background.onPointerMove(e)
        }}
        onPointerLeave={() => {
          planPointer.point = null
        }}
        // a warehouse type dragged from the Blocks tab: a copy stands where it drops (Decision "Warehouse copies")
        onDragOver={(e) => {
          if (!isTypeDrag(e)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={(e) => {
          const type = isTypeDrag(e) ? e.dataTransfer.getData(TYPE_MIME) : ''
          if (!type) return
          e.preventDefault()
          placeCopy(type, camera.toWorld(e))
        }}
        onDoubleClick={(e) => {
          if (toolActive || accessToolOn() || useSiteTool.getState().tool || (e.target instanceof Element && e.target.closest('[data-handle],[data-mass],[data-dimension],[data-reference-line],[data-note],[data-road]'))) return
          camera.fitContent()
        }}
      >
        {camera.view && (
          <>
            <defs>
              <HatchPatterns base={hatchBase} px={px} />
            </defs>
            {/* the map under everything (Phase 5.4); the site's paper lets it show through */}
            {!looking && <MapLayer />}
            {derived.site.polygon && <path d={pathOf([derived.site.polygon])} fill="var(--panel)" fillOpacity={mapShown ? 0.2 : 1} />}
            {/* the structural grid (Show's Grid; Decision "Grid always"): hairlines across the whole view, on the site's
                paper and behind every drawing; an opaque mass hides it, a ghosted one lets it show */}
            <GridLayer px={px} viewBox={camera.viewBox} />
            {/* the site's drawings (Decision "Drawing layers"): its drawing lines and parcels, under all that is designed */}
            <DrawingsLayer px={px} />
            {/* the project's reference lines (Phase AS.5): guides on every level, in every option, in All levels too; those *On top* are drawn again below, over the masses */}
            <ReferenceLinesLayer px={px} drag={drag} interactive={!showAll && !toolActive && !deaf} />
            {boundaryShown && derived.site.polygon && (
              <path data-layer="boundary" d={pathOf([derived.site.polygon])} fill="none" stroke="var(--ink-secondary)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            )}
            {buildableShown && derived.site.buildable.length > 0 && (
              <path
                data-layer="buildable"
                d={pathOf(derived.site.buildable.flat())}
                fill="none"
                fillRule="evenodd"
                stroke="var(--ink-tertiary)"
                strokeWidth={1}
                strokeDasharray="6 4"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {/* the ground (Show's Terrain ▾), on the site's paper, under all that stands on it; a look's too: its cut and
                fill and its platforms' levels are what an optimizer of the ground is judged by (found in the stress test) */}
            <TerrainLayer px={px} />

            {!showAll && designed && <CourtsLayer approaches />}
            {!showAll && designed && <StallsLayer />}
            {!showAll && <LotsLayer px={px} drag={drag} interactive={!toolActive && !looking && !siteBusy} />}
            {!showAll && <RoadsLayer px={px} interactive={!toolActive && !looking} drag={drag} toWorld={camera.toWorld} />}
            {/* the gates over the roads: a gate stands on its host's edge, so its handle half lay under the paving-wide hit strokes (Phase PE.2 review) */}
            {!showAll && <AccessLayer px={px} drag={drag} interactive={!looking} />}
            {showAll ? <AllLevels /> : <LowerLevels />}
            {!showAll && <OtherBuildings drag={drag} scale={camera.scale} px={px} withError={withError} still={looking} />}
            {/* paper under the level's masses: the levels below do not show through them (Practiko's opaque level);
                none while Ghosted, so what is under them (the grid, the levels below) shows */}
            <g pointerEvents="none">
              {!see && masses.map((m) => {
                const polygon = derived.masses[m.id]?.polygon
                return polygon && polygon.length >= 3 ? <path key={m.id} d={pathOf([polygon])} fill="var(--panel)" /> : null
              })}
            </g>

            {masses.map((m) => {
              const dm = derived.masses[m.id]
              if (!dm || dm.polygon.length < 3) return null
              const selected = selectedIds.includes(m.id)
              const error = withError.has(m.id)
              // a context building's masses: neutral grey and dashed, whatever their program
              const context = isContext(project, m)
              const marked = selected || dropOn === m.id
              // isolated in the Overview (Decision "Isolate in the Overview"): the others faint
              const aside = !inIsolated(project, m, isolated)
              const d = pathOf([dm.polygon, ...dm.holes])
              const program = m.programId ? project.programs.find((g) => g.id === m.programId) : null
              return (
                <Fragment key={m.id}>
                {/* the paper's halo under a selected (or drop target's) outline, as in Practiko */}
                {marked && !ghost && <path d={d} fill="none" stroke="var(--panel)" strokeWidth={HALO_PX} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
                <path
                  d={d}
                  fill={context ? 'var(--context-fill)' : (fillOf(project, m, colorBy) ?? 'var(--fill)')}
                  fillOpacity={ghost || aside ? 0.14 : context ? 1 : see ? SEE_THROUGH : FILL_OPACITY}
                  strokeOpacity={aside ? 0.35 : undefined}
                  stroke={error ? 'var(--status-over)' : marked ? 'var(--ink)' : context ? 'var(--context-stroke)' : ghost ? 'var(--ink-tertiary)' : 'var(--ink)'}
                  strokeWidth={marked ? SELECTED_PX : ghost || context ? 1 : STROKE_PX}
                  strokeDasharray={context ? '5 3' : undefined}
                  vectorEffect="non-scaling-stroke"
                  className={massIsLocked(project, m) ? 'cursor-default' : drag.key === `mass-${m.id}` ? 'cursor-grabbing' : 'cursor-grab'}
                  data-mass={m.id}
                  pointerEvents={deaf ? 'none' : undefined}
                  {...(deaf || massIsLocked(project, m) ? {} : drag.bind(`mass-${m.id}`, startMassDrag(m.id, camera.scale)))}
                  onDragOver={(e) => {
                    if (!isMassDrop(e)) return
                    e.preventDefault() // accepted only over a mass: elsewhere the cursor says it cannot drop
                    e.dataTransfer.dropEffect = 'move'
                    setDropOn(m.id)
                  }}
                  onDragLeave={() => setDropOn((d) => (d === m.id ? null : d))}
                  onDrop={(e) => {
                    setDropOn(null)
                    if (dropOnMass(e, m.id)) e.preventDefault()
                  }}
                />
                {/* its program's hatch over its colour (a ghost or a context mass has none) */}
                {!ghost && !context && designed && <HatchFill base={hatchBase} hatch={hatchOf(program)} d={d} opacity={see ? SEE_THROUGH : undefined} />}
                {/* the corridors round its holes (Phase H.4): paper, dashed */}
                {!ghost &&
                  dm.corridors.map((c) => (
                    <path
                      key={c.k}
                      data-corridor={c.k}
                      d={pathOf(c.rings)}
                      fill="var(--panel)"
                      fillOpacity={0.7}
                      stroke="var(--ink-secondary)"
                      strokeWidth={1}
                      strokeDasharray="4 3"
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  ))}
                </Fragment>
              )
            })}

            {/* a placed block's modules and, zoomed in, its columns (Decision "Blocks on the site") */}
            {/* mixed-use-mvp: the residential module's typical floor and columns, over the masses, under their labels */}
            {!showAll && <CapaResidencial />}
            {/* mixed-use-mvp: Programs y Furniture en las naves (maniobras, almacenaje, racks) */}
            {!showAll && designed && <InterioresNave />}
            {!showAll && designed && <BlockSiteLayer px={px} scale={camera.scale} />}
            {/* Cut & fill (Decision "Platforms"): over the courts and the masses, where most of it is; under the labels */}
            {!showAll && <CutFill />}
            {looking && <DesignGhost />}

            {!ghost && masses.map((m) => {
              const dm = derived.masses[m.id]
              if (!dm || dm.polygon.length < 3) return null
              const c = centroid(dm.polygon)
              const b = bounds(dm.polygon)
              const area = m2(dm.area)
              const fits = labelFits(b.maxX - b.minX, b.maxY - b.minY, px, [m.name, area])
              return (
                <g key={m.id} pointerEvents="none">
                  {labels && fits && (
                    // two lines, the name in bold, on a halo of paper (Practiko's labels)
                    <text
                      x={c.x}
                      y={-c.y}
                      textAnchor="middle"
                      fontSize={LABEL_PX * px}
                      fill="var(--ink)"
                      stroke="var(--panel)"
                      strokeWidth={LABEL_PX * 0.25 * px}
                      strokeLinejoin="round"
                      paintOrder="stroke"
                      data-label={m.id}
                    >
                      <tspan x={c.x} dy={-0.15 * LABEL_PX * px} fontWeight={600}>{m.name}</tspan>
                      <tspan x={c.x} dy={1.2 * LABEL_PX * px}>{area}</tspan>
                    </text>
                  )}
                  {/* a locked mass says so above its name */}
                  {massIsLocked(project, m) && <LockGlyph at={{ x: c.x, y: c.y + 20 * px }} px={px} size={11} />}
                </g>
              )
            })}

            {!showAll && designed && <DocksLayer px={px} />}
            {!showAll && designed && <CourtGaps px={px} />}
            {!showAll && !ghost && labels && <PlatformMarks px={px} />}
            {!showAll && <ReferenceLayer />}
            {/* the drawing layers and parcels the tree puts On top: over the masses and all that is designed, under the dimensions */}
            <DrawingsLayer px={px} over />
            <ReferenceLinesLayer px={px} drag={drag} interactive={!showAll && !toolActive && !deaf} over />

            {target && (
              <circle cx={target.point.x} cy={-target.point.y} r={24 * px} fill="none" stroke="var(--status-over)" strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" data-goto-mark>
                <animate attributeName="r" values={`${16 * px};${32 * px};${16 * px}`} dur="1.2s" repeatCount="indefinite" />
              </circle>
            )}
            {!still && <DimensionsLayer px={px} drag={drag} />}
            {/* the level's notes (Phase AS.5): drawn as the labels are, over the masses, with the dimensions */}
            {!still && <NotesLayer px={px} drag={drag} interactive={!showAll && !toolActive && !deaf} />}
            {!showAll && !ghost && <RulesLayer px={px} />}
            {!showAll && graphOn && <GraphLayer px={px} bind={deaf ? undefined : (id) => drag.bind(`mass-${id}`, startMassDrag(id, camera.scale))} />}
            {!showAll && !toolActive && !still && <IssueMarkers px={px} />}
            {/* a placed block's court hit paths and dock hit bands go UNDER its own handles: a press on the outer half of a docked wall's pill is the pill's (D.3 review B3) */}
            {!showAll && !toolActive && !deaf && !graphOn && <BlockCourtHandles drag={drag} scale={camera.scale} toWorld={camera.toWorld} pick part="hits" />}
            {!showAll && !toolActive && !deaf && !graphOn && <SiteEdgeSelect camera={{ scale: camera.scale, viewBox: camera.viewBox, toWorld: camera.toWorld }} part="hits" />}
            {/* the outlines the shape engine edits (the picked mass and its holes, a placed block): one set of handles; Transform's rotation handle over them (D.1 task 5) */}
            {!toolActive && !deaf && <SiteShapeHandles drag={drag} scale={camera.scale} toWorld={camera.toWorld} />}
            {!toolActive && !deaf && <MassHandles drag={drag} scale={camera.scale} />}
            {!toolActive && !deaf && !showAll && <GroupTurn drag={drag} scale={camera.scale} />}
            {!showAll && !toolActive && !deaf && !graphOn && <DockMarks px={px} drag={drag} />}
            {!showAll && !toolActive && !deaf && !graphOn && <DoorSlots px={px} />}
            {!showAll && !toolActive && !deaf && !graphOn && <CourtPills px={px} drag={drag} />}
            {/* a placed block's truck courts on the shape handles: the pill for each, all the handles of the one clicked (D.3 task 7) */}
            {!showAll && !toolActive && !deaf && !graphOn && <BlockCourtHandles drag={drag} scale={camera.scale} toWorld={camera.toWorld} pick part="handles" />}
            {/* a placed block's docks, doors and patterns picked, slid, counted and widened (D.3 task 11) */}
            {!showAll && !toolActive && !deaf && !graphOn && <SiteEdgeSelect camera={{ scale: camera.scale, viewBox: camera.viewBox, toWorld: camera.toWorld }} part="handles" />}
            {!showAll && !toolActive && !still && <PathHandles px={px} drag={drag} scale={camera.scale} toWorld={camera.toWorld} />}
            {!showAll && !toolActive && !deaf && <ReferenceLineHandles px={px} drag={drag} />}
            {!showAll && !toolActive && !still && !deaf && <LotHandles px={px} drag={drag} />}
            {!showAll && !toolActive && !still && !deaf && <ParkingPills px={px} />}
            {!still && <ToolLayer camera={{ scale: camera.scale, viewBox: camera.viewBox, toWorld: camera.toWorld }} />}
            {/* the site's Court tool on a placed block: its pills over the tool's layer, dragged for a depth as in Select (GT.8) */}
            {!showAll && courtTool && !deaf && !graphOn && <CourtPills px={px} drag={drag} />}
            {!showAll && courtTool && !deaf && !graphOn && <BlockCourtHandles drag={drag} scale={camera.scale} toWorld={camera.toWorld} pick={false} />}
            <ImportLayer />
            {!looking && <AccessToolLayer camera={{ scale: camera.scale, viewBox: camera.viewBox, toWorld: camera.toWorld }} />}
            <SiteToolLayer camera={{ scale: camera.scale, viewBox: camera.viewBox, toWorld: camera.toWorld }} />
            <SnapMark mark={drag.mark} px={px} />
            {/* the typed dimension: the live number beside the handle dragged, then what is typed (D.1 task 4) */}
            <DimensionField px={px} mode="live" />
            {/* window: a solid line; crossing (right to left): dashed, as in AutoCAD */}
            {box && <SelectionWindow box={box} />}
          </>
        )}
      </svg>
    </div>
  )
}

/** The design under a look, dashed over it: where its masses of the active level are now (Decision "Specimen preview"). */
function DesignGhost() {
  const project = useApp((s) => s.project)
  const derived = useApp((s) => s.derived)
  const level = useApp((s) => s.level)
  return (
    <g pointerEvents="none" data-design-ghost>
      {project.masses
        .filter((m) => m.levelId === level)
        .map((m) => {
          const polygon = derived.masses[m.id]?.polygon
          if (!polygon || polygon.length < 3) return null
          return <path key={m.id} d={pathOf([polygon])} fill="none" stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
        })}
    </g>
  )
}
