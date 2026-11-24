// The interface icons, drawn here so they add no dependency. Port of Plaza-Practiko `vistas/comunes/Icon.tsx`
// (only the icons GFit uses; add more from there when a control needs them).
// 1.5 px stroke in currentColor: they take the colour of the text next to them. Always decorative: the button
// carries the accessible name.

export type IconName =
  | 'close'
  | 'warning'
  | 'program'
  | 'layers'
  | 'properties'
  | 'map'
  | 'import'
  | 'boundary'
  | 'move'
  | 'chevronUp'
  | 'chevronDown'
  | 'expand'
  | 'collapse'
  | 'more'
  | 'menu'
  | 'undo'
  | 'redo'
  | 'plus'
  | 'trash'
  | 'duplicate'
  | 'copyUp'
  | 'copyDown'
  | 'rotate'
  | 'mirror'
  | 'array'
  | 'align'
  | 'panelLeft'
  | 'panelRight'
  | 'reset'
  | 'image'
  | 'sliders'
  | 'grip'
  | 'cursor'
  | 'mass'
  | 'hole'
  | 'split'
  | 'door'
  | 'corner'
  | 'chamfer'
  | 'dimension'
  | 'ruler'
  | 'referenceLine'
  | 'note'
  | 'lock'
  | 'unlock'
  | 'buildings'
  | 'levels'
  | 'chevronRight'
  | 'check'
  | 'eye'
  | 'eyeOff'
  | 'link'
  | 'heights'
  | 'graph'
  | 'interiors'
  | 'columns'
  | 'play'
  | 'minus'
  | 'help'
  | 'clock'
  | 'gate'
  | 'road'
  | 'dock'
  | 'truck'
  | 'parking'
  | 'chart'
  | 'target'
  | 'cloudCheck'
  | 'cloudOff'
  | 'moon'
  | 'sun'
  | 'blocks'
  | 'pencil'
  | 'group'
  | 'union'
  | 'pattern'
  | 'existingRoad'
  | 'onTop'

/** The 16 × 16 paths, for what draws an icon inside an SVG of its own (the plan's lock). */
export const ICON_PATHS: Record<IconName, string> = {
  // four modules: the smart blocks (Decision "Smart blocks")
  blocks: 'M2.75 2.75h4.5v4.5h-4.5ZM8.75 2.75h4.5v4.5h-4.5ZM2.75 8.75h4.5v4.5h-4.5ZM8.75 8.75h4.5v4.5h-4.5Z',
  pencil: 'M10.25 3.25l2.5 2.5-7 7H3.25v-2.5ZM8.75 4.75l2.5 2.5',
  // the Tools strip's: Group (two shapes inside one frame), Union (two squares as one outline), Pattern (marks standing on a
  // wall: a downpipe each module), Existing road (a road with its centreline drawn, aslant, against Road's dashed one)
  group: 'M2.75 5.75v-3h3M10.25 2.75h3v3M13.25 10.25v3h-3M5.75 13.25h-3v-3M5.75 5.75h2.5v2.5h-2.5ZM8.5 8.5h2.5v2.5H8.5Z',
  union: 'M2.75 2.75h6.5v4h4v6.5h-6.5v-4h-4Z',
  pattern: 'M2.75 13.25h10.5M5 8.5v4.75M11 8.5v4.75M6.5 7a1.5 1.5 0 1 0 0 .01M12.5 7a1.5 1.5 0 1 0 0 .01',
  existingRoad: 'M3 13.25 6.75 2.75M9.25 13.25 13 2.75M6.1 13.25 9.9 2.75',
  // On top (Layers): a sheet laid over another
  onTop: 'M5.75 7.25v-4.5h7.5v7.5h-4.5M2.75 7.25h6v6h-6Z',
  close: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
  warning: 'M8 2.75 14.25 13.5H1.75L8 2.75ZM8 6.75v3M8 11.75h.01',
  // the Parameters tabs: Program (lines of a list), Site (a folded map)
  program: 'M2.5 4.5h8M2.5 8h11M2.5 11.5h5.5',
  // the Layers tab: a tree, a branch and two rows under it
  layers: 'M2.75 3.5h10.5M5.25 8h8M5.25 12.5h8M2.75 8h.01M2.75 12.5h.01',
  // the Properties tab: a sheet of fields, a label and a value on each line
  properties: 'M2.75 2.75h10.5v10.5H2.75ZM5 5.75h1.5M8.5 5.75H11M5 8h1.5M8.5 8H11M5 10.25h1.5M8.5 10.25H11',
  map: 'M1.75 3.75 5.5 2.5l5 1.25 3.75-1.25v9.75L10.5 13.5l-5-1.25-3.75 1.25V3.75ZM5.5 2.5v9.75M10.5 3.75v9.75',
  import: 'M8 2.75v7M5 6.75l3 3 3-3M2.75 10.5v2.75h10.5V10.5',
  boundary: 'M3.25 12.75 2.5 5.75 8 2.5l5.5 3.25-1.25 7Z',
  move: 'M8 1.75v12.5M1.75 8h12.5M6 3.75l2-2 2 2M6 12.25l2 2 2-2M3.75 6l-2 2 2 2M12.25 6l2 2-2 2',
  chevronUp: 'M4.5 10 8 6.5l3.5 3.5',
  chevronDown: 'M4.5 6 8 9.5 11.5 6',
  // full screen: corners out (enter) and in (leave)
  expand: 'M2.75 6V2.75H6M10 2.75h3.25V6M13.25 10v3.25H10M6 13.25H2.75V10',
  collapse: 'M6 2.75V6H2.75M13.25 6H10V2.75M10 13.25V10h3.25M2.75 10H6v3.25',
  more: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
  // the phone's ☰: the top menu in one button
  menu: 'M2.75 4.25h10.5M2.75 8h10.5M2.75 11.75h10.5',
  undo: 'M5.5 3.5 2.75 6.25 5.5 9M2.75 6.25h6a3.5 3.5 0 0 1 0 7H6.5',
  redo: 'M10.5 3.5l2.75 2.75L10.5 9M13.25 6.25h-6a3.5 3.5 0 0 0 0 7h1',
  plus: 'M8 3v10M3 8h10',
  // the Brief tab's steppers: a mass less
  minus: 'M3 8h10',
  // the exterior circulation (Decision "Exterior circulation"): Gate (an opening
  // with its arrow in), Road (two edges and a dashed axis; the Circulation tab too), docks (a wall with its doors; the
  // Brief's Docks column), a truck
  gate: 'M1.75 12.75H5M11 12.75h3.25M8 13.25V3.75M5.75 6 8 3.75 10.25 6',
  road: 'M4.25 2.75v10.5M11.75 2.75v10.5M8 3v2M8 7v2M8 11v2',
  dock: 'M2.75 2.75h10.5v6.5H2.75ZM4.75 9.25v4M8 9.25v4M11.25 9.25v4',
  truck: 'M1.75 4.25h7.5v6.5h-7.5ZM9.25 6.75h2.5l2.5 2.25v1.75h-5M4.25 12.25a1.25 1.25 0 1 0 0 .01M11.25 12.25a1.25 1.25 0 1 0 0 .01',
  // the Parking tab (Decision "Parameter tabs"): a parking sign
  parking: 'M2.75 2.75h10.5v10.5H2.75ZM6.5 11V5h2.25a1.75 1.75 0 0 1 0 3.5H6.5',
  // the Summary's tabs (Decision "Summary tabs"): its figures as bars; the brief as a target
  chart: 'M2.75 13.25h10.5M4.25 13.25v-4.5M8 13.25V3.25M11.75 13.25V6.75',
  target: 'M8 14.25a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5ZM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8 8h.01',
  // autosave on and off (Decision "Saving"): a cloud with a check, a cloud struck through
  cloudCheck: 'M4.75 12.75h6.75a3 3 0 0 0 .35-5.98A4.25 4.25 0 0 0 3.6 7.6a2.6 2.6 0 0 0 1.15 5.15ZM6.25 9.75l1.25 1.25 2.5-2.75',
  cloudOff: 'M4.75 12.75h6.75a3 3 0 0 0 .35-5.98A4.25 4.25 0 0 0 3.6 7.6a2.6 2.6 0 0 0 1.15 5.15ZM2.25 2.25l11.5 11.5',
  // the theme toggle of the top bar: the moon goes dark, the sun goes light
  moon: 'M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75a5.5 5.5 0 1 0 6.85 6.85Z',
  sun: 'M8 10.75a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5ZM8 1.75v1.5M8 12.75v1.5M1.75 8h1.5M12.75 8h1.5M3.6 3.6l1.05 1.05M11.35 11.35l1.05 1.05M3.6 12.4l1.05-1.05M11.35 4.65l1.05-1.05',
  // the top bar's help: the notes and the guide
  clock: 'M8 14.25a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5ZM8 4.75V8l2.25 1.5',
  help: 'M8 14.25a6.25 6.25 0 1 0 0-12.5 6.25 6.25 0 0 0 0 12.5ZM6.25 6.4a1.8 1.8 0 1 1 2.5 1.65c-.45.2-.75.6-.75 1.1v.35M8 11.4h.01',
  trash: 'M2.75 4.25h10.5M6 4.25V2.75h4v1.5M4.25 4.25l.5 9h6.5l.5-9M6.75 6.75v4M9.25 6.75v4',
  rotate: 'M12.75 8a4.75 4.75 0 1 1-1.4-3.37M12.75 2.75v3h-3',
  // the General group's Mirror (a shape and its image either side of the axis), Array (a row of copies) and Align (things on a line)
  mirror: 'M8 1.75v12.5M6.25 4.25 2.25 12.25h4ZM9.75 4.25l4 8h-4Z',
  array: 'M1.75 6.5h3v3h-3ZM6.5 6.5h3v3h-3ZM11.25 6.5h3v3h-3Z',
  align: 'M2.75 1.75v12.5M5.25 3.75h7.5v3h-7.5ZM5.25 9.25h4.5v3h-4.5Z',
  // Properties' compact actions (Decision "Compact Properties"): a copy beside; a copy a level up or down
  duplicate: 'M5.75 5.75h7.5v7.5h-7.5ZM10.25 5.75v-3h-7.5v7.5h3',
  copyUp: 'M2.75 9.25h7.5v4h-7.5ZM10.25 4.75 12.5 2.5l2.25 2.25M12.5 2.5v7',
  copyDown: 'M2.75 2.75h7.5v4h-7.5ZM10.25 11.25l2.25 2.25 2.25-2.25M12.5 13.5v-7',
  // show / hide a side panel: a window with its left or right strip
  panelLeft: 'M2.75 3.25h10.5v9.5H2.75ZM6.25 3.25v9.5',
  panelRight: 'M2.75 3.25h10.5v9.5H2.75ZM9.75 3.25v9.5',
  // frame the model: four corners
  reset: 'M3.5 6.5v-3h3M12.5 6.5v-3h-3M3.5 9.5v3h3M12.5 9.5v3h-3',
  // the Export rows: a 3D model (a box in perspective), an image (a picture with a mountain)
  image: 'M2.75 3.25h10.5v9.5H2.75ZM2.75 10.75l3-2.75 2.5 2 2-1.75 3 2.5M10.5 5.75h.01',
  // customize the KPI strip (two sliders); a row's drag handle (six dots)
  sliders: 'M2.75 5h10.5M2.75 11h10.5M5.5 3.25v3.5M10.5 9.25v3.5',
  grip: 'M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01',
  // the tools rail: Select (an arrow), Mass (a footprint), Corner (a rounded corner), Chamfer (a cut one), Dimension (a line between
  // two ticks), Ruler (a rule with its marks)
  cursor: 'M4 2.5v10.25l2.9-2.65 1.85 4.15 1.75-.8-1.85-4.1h3.85L4 2.5Z',
  mass: 'M2.75 4.25h10.5v7.5H2.75ZM2.75 8.75h4v3',
  hole: 'M2.75 2.75h10.5v10.5H2.75ZM6.25 6.25h3.5v3.5h-3.5Z',
  // the Warehouse's Split and Door (Decision "Warehouse by hand"): a box cut in two by a line; a wall's opening
  split: 'M2.75 2.75h10.5v10.5H2.75ZM8 1.25v2.5M8 5.5v1.5M8 8.75v1.5M8 12.25v2.5',
  door: 'M1.75 12.75h3.5V4.25h5.5v8.5h3.5M5.25 8.5h5.5',
  corner: 'M3 13.25V9a6 6 0 0 1 6-6h4.25',
  // Chamfer: the same corner, cut by a straight line
  chamfer: 'M3 13.25V8.5L8.5 3h4.75',
  dimension: 'M2.75 4.5v7M13.25 4.5v7M2.75 8h10.5M5 6.5 2.75 8 5 9.5M11 6.5 13.25 8 11 9.5',
  ruler: 'M1.75 5.5h12.5v5H1.75ZM4.25 5.5v2M6.75 5.5v3M9.25 5.5v2M11.75 5.5v3',
  // a reference line: a dashed guide running across the page, a tick at each end
  referenceLine: 'M2.75 13.25 4.25 11.75M6.25 9.75 9.75 6.25M11.75 4.25 13.25 2.75M1.75 11.25 4.75 14.25M11.25 1.75 14.25 4.75',
  // a note: the letter T, the text placed on the plan
  note: 'M3 3.75V2.75h10v1M8 2.75v10.5M6 13.25h4',
  // a lock, closed and open (masses and dimensions that keep their shape or length)
  lock: 'M3.75 7.25h8.5v6.25h-8.5ZM5.5 7.25V5a2.5 2.5 0 0 1 5 0v2.25',
  unlock: 'M3.75 7.25h8.5v6.25h-8.5ZM5.5 7.25V5a2.5 2.5 0 0 1 4.9-.7',
  // the Buildings tab: a low block and a tall one with windows
  // a stack of floor slabs
  levels: 'M8 1.75 14.25 5 8 8.25 1.75 5 8 1.75ZM1.75 8 8 11.25 14.25 8M1.75 11 8 14.25 14.25 11',
  buildings: 'M1.75 13.25h12.5M2.75 13.25V7.25h4.5v6M7.25 13.25V2.75h6v10.5M9.5 5.25h1.75M9.5 7.75h1.75M9.5 10.25h1.75',
  // the Buildings tree: open / closed rows, the active option, hide a building, a building shared by options
  chevronRight: 'M6 4.5 9.5 8 6 11.5',
  check: 'M3.5 8.5l3 3 6-7',
  eye: 'M1.75 8S4.25 3.75 8 3.75 14.25 8 14.25 8 11.75 12.25 8 12.25 1.75 8 1.75 8ZM8 9.75a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z',
  eyeOff: 'M1.75 8S4.25 3.75 8 3.75 14.25 8 14.25 8 11.75 12.25 8 12.25 1.75 8 1.75 8ZM2.75 2.75l10.5 10.5',
  // Compare: panes side by side
  columns: 'M2.75 3.25h10.5v9.5H2.75ZM6.25 3.25v9.5M9.75 3.25v9.5',
  // the Graph's Solve: from the brief and its rules to geometry
  play: 'M4.75 3.25v9.5L12.5 8Z',
  // Rules and Interiors: two programs and the rule between them; a plan of rooms
  graph: 'M4.5 6.75a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM11.5 13.25a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM5.9 6.15l4.2 4.2',
  interiors: 'M2.75 2.75h10.5v10.5H2.75ZM2.75 8.25h5v5M7.75 2.75v2.5M10.25 8.25h3',
  link: 'M6.75 9.25a2.5 2.5 0 0 0 3.54 0l2.12-2.12a2.5 2.5 0 0 0-3.54-3.54l-.7.7M9.25 6.75a2.5 2.5 0 0 0-3.54 0L3.59 8.87a2.5 2.5 0 0 0 3.54 3.54l.7-.7',
  // the Heights tool (Decision "Terrain layout"): two contours and a mark set on the upper one
  // the Grid tool (Decision "Grid layout"): two bay lines each way, a bubble on one
  heights: 'M1.75 13c2-1.25 4-1.25 6.25 0s4.25 1.25 6.25 0M1.75 9.25c2-1.25 4-1.25 6.25 0s4.25 1.25 6.25 0M8 2v4.75M6.25 5 8 6.75 9.75 5',
}

// An icon is never dragged as an image (Decision "No text selected by a drag"). SVGProps has no `draggable`, so it is spread.
const NOT_DRAGGED = { draggable: false }

/** One of the icons above by `name`, or a `path` of its own on the same grid (a plugin's: Decision "Optimizer plugin"). */
export function Icon({ className = 'h-4 w-4', ...icon }: ({ name: IconName } | { path: string }) & { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...NOT_DRAGGED}
    >
      <path d={'path' in icon ? icon.path : ICON_PATHS[icon.name]} />
    </svg>
  )
}
