# GFit in Claude Desktop (MCP)

GFit's MCP server lets Claude Desktop (or any MCP client) work on the project open in your browser, with the same tools
as the Agent tab: it reads the project, its KPIs and Issues, and changes it through the app's verbs. Each change is one
undo step, and the decision log says it was the agent's. See Decision *MCP server* in `ARCHITECTURE.md`.

> **Held back for now.** While the Agent is "coming soon" (`src/plugins/comingSoon.ts`) GFit's tab does not start its side of
> the bridge: the bridge is loaded by the Agent’s tab, at the end of the left panel’s row, which is dimmed and does not open while the plugin is held back, and the
> switch that turns MCP on lives in the Agent tab, which does not open either. Claude Desktop starts `mcp/server.ts` as
> ever, but finds no tab to talk to. Removing `agent` from `COMING_SOON` brings it back.

```
Claude Desktop ──stdio──▶ node mcp/server.ts ──http://127.0.0.1:4590──▶ GFit's tab (Agent → Claude Desktop: On)
```

## What you need

- **Node 22.18 or newer** (it runs `mcp/server.ts` as it is, without a build). Check with `node --version`.
- GFit running in a browser on this computer (`npm run dev`).

## Set it up once

1. Open Claude Desktop's config: *Settings → Developer → Edit Config*. The file is
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Add GFit under `mcpServers`, with the full path to `mcp/server.ts` in your copy of the repo:

   ```json
   {
     "mcpServers": {
       "gfit": {
         "command": "node",
         "args": ["C:\\Users\\you\\path\\to\\gfit-generative-information-modeler\\mcp\\server.ts"]
       }
     }
   }
   ```

3. Quit and reopen Claude Desktop. GFit's tools show under the tools icon.
4. In GFit, open **Agent** (beside Optimize) and turn **Claude Desktop (MCP)** on. Within a few seconds it says
   *Connected*, and Agent shows a dot. The setting is kept in this browser.

## Use it

Ask Claude for the design in plain words: "Read my GFit project and tell me what is wrong", "Move Warehouse 1 10 m east
and check the issues", "Solve the brief". It calls `getProject` first, then the edits, then checks `getIssues` (each issue with its step: massing or flow, what settles it) or
`getKpis`. Undo (Ctrl+Z) takes back any of its changes; the *Decision log* lists them as *Agent*.

It draws too, point by point (Phase H): "Add a warehouse with corners (0,0), (80,0), (100,30), (80,60), (0,60), with two
10 × 10 m courts inside and a 2 m corridor round each" (`addMassFromPoints` with `holes`), "Move corner 3 of Warehouse 1
5 m north" (`getMassOutline`, then `moveVertex`), "Merge the three halves of Bodega 2" (`mergeMasses`), "Cut a court in
Warehouse 2" (`addHole`, `setHoleCorridor`).

### Padlocks (Phase AS.4)

A mass, a building, a street, a gate and a lot have a padlock (Decision *Padlocks by kind*): the object is seen and no
tool changes it or deletes it. The tools that lock and unlock, each one undo step (`locked: false` frees), are these, and
the last two are the drawings' own padlocks (a locked layer is not picked and does not move):

| Tool | Locks | Arguments |
|---|---|---|
| `lockMasses` | masses | `masses` (ids), `locked` |
| `lockBuildings` | buildings: its data, its levels and platform, and every mass in it, which counts as locked; `locked: false` also frees the masses locked one by one | `buildings` (ids), `locked` |
| `lockStreets` | street segments (a street is locked when all its segments are): its type, the paving each side, the place of its two nodes | `segments` (ids), `locked`, `option` |
| `lockGates` | gates of an option: place, width and flow | `gates` (ids), `locked`, `option` |
| `lockLots` | parking lots of an option: wall, rows, sizes and entrance | `lots` (ids), `locked`, `option` |
| `setDrawingLayerLocked` | a layer of an imported drawing | `file`, `layer`, `locked` |
| `setParcelsLocked` | a file's parcels, all together | `file`, `locked` |

`option` is optional everywhere: absent, the one in view. A street's and a gate's padlock are of that option only (a copy
of an option has the same segment ids, and locking one there leaves the other free); a lot's ids are the project's. `getProject` says `locked` for each mass, building, gate and
lot, and a street segment carries it in `streets`.

A tool that would change a locked object, or delete it, refuses the whole call and says which one and what frees it:
`Warehouse 1 is locked: unlock it (lockMasses) to change it.`, and the same with `Street segment <id>` (`lockStreets`),
`Gate <id>` (`lockGates`), a lot's or a building's name (`lockLots`, `lockBuildings`). `lockMasses` with `locked: false` on a mass
of a locked building says whose padlock holds it: `Warehouse 2 is locked with its building: unlock Annex (lockBuildings) to unlock it.` The tools that edit a street's
segments, a gate, a lot or a building (and its levels) check before they act, so the refusal names the tool to use; a
change that gets past them is refused by `settle.ts` all the same, with `<name> is locked: unlock it to change it.` (or
`to delete it`),, so neither the agent, the optimizer nor a drag can change a locked object.

### Planning on the site (Phase 8.3–8.6)

Four tools let it plan before it places, so it does not find out by trial and error. They read the engine the checks
use, so what they say is what `getIssues` says:

| Tool | What it gives | Changes the project |
|---|---|---|
| `getSite` | The boundary counter-clockwise with each edge (index, ends, length), the buildable area as polygons with holes, areas and bounding boxes, the gates in plan coordinates (the boundary edge it stands on, or `on`: the street or existing street, its side and the metres along it; width, flow, vehicles, the way in), the roads with their lanes, the standards that size the room round masses | No |
| `getDocks` | Per mass with docks: each docked wall (index, ends, length, facing), its doors, its truck court as a polygon (`shapes`: the paved polygons of a court with a shape of its own, `court` then the rectangle that holds them), what the court runs into, whether a truck gate reaches it | No |
| `checkMasses` | A dry run: new masses (rectangles or points) or masses there are moved or taken out, tried on a copy; the Issues getIssues would give, each marked new or not | No (no undo step) |
| `packMasses` | N masses of a program of an area (down to a tolerance), in rows turned as allowed; with docks, rows facing each other across a shared court. Checked as above; if fewer fit, how many and why (coverage, buildable area, shape) and how many fit closer together | With `apply: true` (one undo step) |

And two edits: `setMassDocks` (which walls of a mass dock, by index) and `setProgramDocks` (which programs dock, any
typology). A court's depth is its wall's own (`setCourtDepth`), else its block's (`setBlockCourt`), else the project's
standard (`updateStandards`, `courtDepth`); `getDocks` says each one's and the docked wall it shares its court with.

Example: "Fit ten warehouses of 5,000 m² with their truck courts, reached from gate g1" (the figures are the test site's,
a 360 × 285.6 m rectangle of 102,816 m², in `src/api/tools/__tests__/site.test.ts`):

1. `getSite`: the boundary, the buildable area (the 10 m setback in), the gate g1 on the street, courts 40 m deep.
2. `packMasses {"program": "warehouse", "count": 10, "area": 5000}`: fewer than 10 fit a street apart (22 m);
   `limit.closer` says 10 fit at a gap of 14 m.
3. `packMasses {"program": "warehouse", "count": 10, "area": 5000, "gap": 14, "apply": true}`: placed, one undo step.
4. `connectStreets`: the buildings first, then the streets (Decision *Streets*): the shortest way from g1 to every court.
5. `getIssues`: no errors, no court or access warnings (or `checkMasses` first, to try changes by hand).

### Streets (Phase PE.1)

A street's paving is two numbers, `left` and `right`: the metres each side of its drawn line, walking it from its first
node. `addStreet` and `addExistingRoad` take `left` and `right`, or a `width` with a `side` (the line is its left edge,
its centre or its right edge), never both; a street type gives a new street's width only (Decision *Street sides*).
`updateExistingRoad` changes an existing street's sides (one alone keeps the other). `setStreetEdges` sets `left` and/or
`right` on street segments, each walked from its node a to b, together at least 0.5 m; locked segments are left out and
named (`lockStreets` frees them), and the drawn line stays. `setStreetType` changes a street's vehicles and turning
radius, not its width. `getSite` gives one entry per run of a street (the segments of one type, sides, vehicles and radius), each with its `left` and
`right`, and a `street` id that the runs of one street share (`segments` and `points` are the run's); only an existing street
carries `stretches`. Each entry also has the links of its nodes: a created street's end on an existing street links to it and follows it. By hand the
same is a pill on each side of a stretch, Shift for the whole street.

### Streets (Phase PE.2)

**Lanes.** A street's width is the sum of its lanes (Decision *Lanes*). `setStreetLanes` sets them on every stretch of a
street of the design (`street`: a segment id or its `street:<segment>` id) or of an existing street (`road`): `count`
makes that many equal lanes of each stretch's width, `widths` gives each lane (m, left to right walking the street; they
must add up to the stretch's width). A lane is 2 m wide at least, the paving's width stays, and a locked segment is left
out and named (`lockStreets` frees it). `getSite` gives each run of a street its `lanes` (the stored ones, else the
equal lanes the app shows: `round(width / laneWidth)` of them, `Standards.laneWidth` being 3.5 m), and each existing street
its stretches with `lanes`, its `locked` and its `group`. `updateExistingRoad` keeps the lanes when its `left` or `right`
changes (the lane at that edge takes or gives the difference) and takes `locked`. By hand the same is a pill with the lane
count on each stretch, each lane line dragged or typed, and *Equal lanes* in the menu.

**Existing streets move.** `moveExistingRoad {road, dx, dy}` and `rotateExistingRoad {road, degrees, x?, y?}` (about x, y,
both or neither: the middle of the street's bounds) move and turn an existing street; the created streets' ends linked
to it and the gates standing on it follow. A locked street stays. There is no mirror or copy tool (the menu has them).

**Gates on any street.** `addGate` and `updateGate` take either `t` (0 to 1 along the boundary, from its first corner) or
`on: {street | road, side, at}`: a side (`left` or `right`, walking the street from its node a, or an existing street along
its drawn line) of a street segment or of an existing street, and `at` metres along it; one of the two, never both. A
gate on a street of the design goes into the option's own gates. The frontage tools (`addFrontage`, `updateFrontage`,
`removeFrontage`) are gone: a saved frontage is an existing street, and any street takes a gate.

### The optimizer (Phase 8.1b)

A plugin's tools come with it (Decision *Plugin tools*): the optimizer's let Claude search many layouts at once, as
▶ Run does in the *Optimize* tab. A run goes in the background and never changes the design; only a specimen kept
becomes a new option. They show while the optimizer is on in this browser (*View → Plugins*).

| Tool | What it does | Changes the project |
|---|---|---|
| `getOptimizer` | The templates (what each lets change, aims at and must hold, its budget), the active one, whether the project has it on, the run if there is one | No |
| `runOptimizer` | Starts a run on an option (the one in view) with a template (the active one), the budget as the template's or one of its own (`population`, `generations`, `seed`); waits up to `wait` s (45 at most), then answers as `getSpecimens`. One run at a time | Turns the optimizer on and makes the template active, if needed (one undo step) |
| `getSpecimens` | The run's progress and its front: each specimen's objectives and whether it holds every must-hold, against the design as it is; the best one for each objective. Waits up to `wait` s while it runs | No |
| `keepSpecimen` | A specimen becomes a new option (*Option 1 · #23*), in view; the option it came from stays | One undo step |

A call waits 60 s at most, so a long run is followed with `getSpecimens {"wait": 40}` until its `status` is `done`.
Example: "Try 300 layouts of my masses and keep the one with the most free ground": `runOptimizer {"population": 30,
"generations": 10}`, then `getSpecimens` (its `best["free-ground"]`), then `keepSpecimen {"specimen": 187}`.

## If it does not connect

- **The Agent tab says "Waiting for GFit's MCP server"**: Claude Desktop is closed, or GFit is not in its config (step
  2), or the path is wrong: Claude Desktop's log (*Settings → Developer*) shows `[gfit-mcp] bridge on …` when it runs.
- **Claude says "GFit is not connected"**: turn on *Claude Desktop (MCP)* in the Agent tab, with GFit open.
- **"Another GFit tab took the connection"**: one tab at a time; *Connect here* takes it back.
- **"Port 4590 is taken by another GFit MCP server"**: an older server (before 2026-10-21) still runs. Claude Desktop
  starts the server twice; now the second relays its calls through the first. Quit Claude Desktop entirely (also from
  the tray) and open it again.
- **Port 4590 is taken by another program**: set another one for the server (`"env": { "GFIT_MCP_PORT": "4600" }` in
  the config). The tab connects to 4590 for now.
- **Try the server alone**: `npm run mcp`, then type
  `{"jsonrpc":"2.0","id":1,"method":"tools/list"}` and Enter: it answers with the tools.

## Safety

The bridge listens on 127.0.0.1 only, and answers only pages of this computer (`localhost`, `127.0.0.1`) by their own
name. The tab connects only while *Claude Desktop (MCP)* is on.
