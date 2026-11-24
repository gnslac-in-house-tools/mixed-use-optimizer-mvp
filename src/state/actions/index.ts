// Every verb of the app in one object, the way views call them: apply((p) => actions.moveMass(p, id, d)).
// Each module is traced (state/trace/calls.ts), so the state graph sees which verb ran and with what.
// - A new verb in an existing module shows up by itself.
// - A new module needs one line here (views must not import action modules directly: a test checks it).
// - A module of src/modules/ brings its verbs in its actions.ts (Decision "Catalog"); only this file imports it.
// - The label is the module's path under src/, without extension: the state graph finds its node by it.
// Tests and MCP tools may import the modules directly: they are the same pure functions.
import { traced } from '../trace/calls.ts'
import * as annotations from './annotations.ts'
import * as buildings from './buildings.ts'
import * as circulation from './circulation.ts'
import * as dimensions from './dimensions.ts'
import * as gateEdges from './gateEdges.ts'
import * as drawings from './drawings.ts'
import * as graph from './graph.ts'
import * as grid from './grid.ts'
import * as groups from './groups.ts'
import * as holes from './holes.ts'
import * as kpis from './kpis.ts'
import * as levels from './levels.ts'
import * as masses from './masses.ts'
import * as path from './path.ts'
import * as plugins from './plugins.ts'
import * as programs from './programs.ts'
import * as project from './project.ts'
import * as selection from './selection.ts'
import * as onEdge from './onEdge.ts'
import * as shape from './shape.ts'
import * as site from './site.ts'
import * as streets from './streets.ts'
import * as docks from '../../modules/docks/actions.ts'
import * as parking from '../../modules/parking/actions.ts'
import * as terrain from '../../modules/terrain/actions.ts'
import * as warehouse from '../../modules/warehouse/actions.ts'

export const actions = {
  ...traced('state/actions/annotations', annotations),
  ...traced('state/actions/buildings', buildings),
  ...traced('state/actions/circulation', circulation),
  ...traced('state/actions/dimensions', dimensions),
  ...traced('state/actions/drawings', drawings),
  ...traced('state/actions/gateEdges', gateEdges),
  ...traced('state/actions/graph', graph),
  ...traced('state/actions/grid', grid),
  ...traced('state/actions/groups', groups),
  ...traced('state/actions/holes', holes),
  ...traced('state/actions/kpis', kpis),
  ...traced('state/actions/levels', levels),
  ...traced('state/actions/masses', masses),
  ...traced('state/actions/path', path),
  ...traced('state/actions/plugins', plugins),
  ...traced('state/actions/programs', programs),
  ...traced('state/actions/project', project),
  ...traced('state/actions/selection', selection),
  ...traced('state/actions/onEdge', onEdge),
  ...traced('state/actions/shape', shape),
  ...traced('state/actions/site', site),
  ...traced('state/actions/streets', streets),
  ...traced('modules/docks/actions', docks),
  ...traced('modules/parking/actions', parking),
  ...traced('modules/terrain/actions', terrain),
  ...traced('modules/warehouse/actions', warehouse),
}
