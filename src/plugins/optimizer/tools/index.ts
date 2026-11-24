// The optimizer's tools for an agent (Phase 8.1b, Decision "Plugin tools"): read the templates, start a run (in its
// worker, as ▶ Run; it never changes the design), follow it, keep a specimen as an option; and the stages' (P.3,
// Decision "Stage tools"): read an option's plan, run or work a stage, evaluate it, approve it. A plugin's tools are its
// `tools/index.ts`, `tools` and `guide`: the manifest gives them to the app, and the MCP server (mcp/plugins.ts) loads
// this file alone, so here is only what it lists (zod and nothing else); what they do is in run.ts, loaded at the
// first call (run.ts, stages.ts).
import { z } from 'zod'
import { pluginTool } from '../../types.ts'

/** An MCP call waits 60 s at most (mcp/bridge.ts `CALL_TIMEOUT`): a tool waits less, then says how far the run is. */
export const WAIT_MAX = 45

const wait = (fallback: number) =>
  z
    .number()
    .min(0)
    .max(WAIT_MAX)
    .optional()
    .describe(`Seconds to wait for the run to end before answering (0 to ${WAIT_MAX}; default ${fallback}): it goes on after the answer`)

const load = () => import('./run.ts')
const stages = () => import('./stages.ts')

const stage = z.string().describe('The stage: its id, name or number (getStages)')
const option = z.string().optional().describe('An option of the plan, id or name: the one it started from or one a stage made; absent: the one in view')
const specimen = z.number().int().min(0).optional().describe('A specimen of its run (getSpecimens); absent: the one picked')

export const tools = [
  pluginTool({
    name: 'getOptimizer',
    description:
      "The optimizer's templates (what each lets change, aims at and must hold, its budget), the active one, whether the project has turned it on, and the run if there is one. Read it before runOptimizer.",
    kind: 'read',
    input: z.object({}),
    run: async () => (await load()).getOptimizer(),
  }),
  pluginTool({
    name: 'runOptimizer',
    description:
      'Starts a run of the optimizer in the background on an option (the one in view by default) with a template (the active one by default): it searches many layouts and never changes the design. Waits up to `wait` seconds, then answers as getSpecimens. Turns the optimizer on for the project if it was not, and makes the template the active one. Refused while another run goes.',
    kind: 'edit',
    input: z.object({
      template: z.string().optional().describe('A template id or name (getOptimizer); absent: the active one'),
      option: z.string().optional().describe('The option to optimize, id or name; absent: the one in view'),
      population: z.number().int().min(4).max(500).optional().describe("This run's population, instead of the template's"),
      generations: z.number().int().min(1).max(1000).optional().describe("This run's generations, instead of the template's"),
      seed: z.number().int().min(0).optional().describe("This run's seed, instead of the template's (the same seed and settings give the same run)"),
      wait: wait(20),
    }),
    run: async (i) => (await load()).runOptimizer(i),
  }),
  pluginTool({
    name: 'getSpecimens',
    description:
      "The run's progress and its best specimens (the front): each one's objectives and whether it holds every must-hold, against the design as it is, and the best specimen for each objective. Waits up to `wait` seconds while the run goes.",
    kind: 'read',
    input: z.object({
      wait: wait(0),
      limit: z.number().int().min(1).max(30).optional().describe('How many specimens of the front to list (default 10): the best for each objective first'),
    }),
    run: async (i) => (await load()).getSpecimens(i),
  }),
  pluginTool({
    name: 'keepSpecimen',
    description:
      'Keeps a specimen of the run as a new option ("<option> · #23": copies of its buildings as the specimen has them) and goes to it; the design it came from stays as it was. One undo step.',
    kind: 'edit',
    input: z.object({ specimen: z.number().int().min(0).describe('The specimen’s id (getSpecimens)') }),
    run: async (i) => (await load()).keepSpecimen(i),
  }),
  pluginTool({
    name: 'getStages',
    description:
      "An option's stage plan (the one in view by default), seed to leaf: each stage's number, name, who works it (optimizer, agent, hand), status (todo, running, review, approved, again), the agent's aim, what it may change, aims at and must hold, its margins over earlier stages (± steps), its input, its attempts and run, and what it approved; and the current stage. Read it before the other stage tools.",
    kind: 'read',
    input: z.object({ option }),
    run: async (i) => (await stages()).getStages(i),
  }),
  pluginTool({
    name: 'runStage',
    description:
      "Works a stage as ▶ Run in Stages: a new attempt, its run started in the background on the stage's input (the option the nearest earlier approved stage kept, else the plan's own: any stage runs at any time) with the stage's parameters; waits up to `wait` seconds, then answers as getSpecimens. A stage worked by the agent may instead be worked by editing (how 'edit'): a copy of its input, the option in view, to change with the other tools. Refused for a stage by hand (the designer's), an approved one, one whose stage before is not approved, and while another run goes. Turns the optimizer on if it was not.",
    kind: 'edit',
    input: z.object({
      stage,
      option,
      how: z.enum(['run', 'edit']).optional().describe("run (default): the optimizer searches; edit: a copy of the input to edit (a stage worked by the agent)"),
      population: z.number().int().min(4).max(500).optional().describe("This attempt's population, instead of the stage's"),
      generations: z.number().int().min(1).max(1000).optional().describe("This attempt's generations, instead of the stage's"),
      seed: z.number().int().min(0).optional().describe("This attempt's seed, instead of the stage's"),
      backToRange: z.boolean().optional().describe('With the designer’s yes: the copies past their block’s range (Decision "Past the range by hand") brought back to it before the run; without it, a run that varies the blocks’ boxes is refused while one is past'),
      wait: wait(20),
    }),
    run: async (i) => (await stages()).runStage(i),
  }),
  pluginTool({
    name: 'evaluateStage',
    description:
      "A stage's review, as Stages shows it: a specimen of its run (or the option worked by editing, or the one approved) against the stage's input: each objective before and after, better or worse; every must-hold, held or not; the other KPIs that changed; and what it moved of what earlier stages approved, within their margins; a stage of the circulation's also lists what only the masses can fix (a court with no room, masses that overlap or stand outside the buildable area) and the earlier stage that moved them, for the designer to reopen. Changes nothing.",
    kind: 'read',
    input: z.object({ stage, option, specimen }),
    run: async (i) => (await stages()).evaluateStage(i),
  }),
  pluginTool({
    name: 'approveStage',
    description:
      "Approves a stage to review, as Approve in Stages: the specimen of its run kept as the stage's option (\"② Buildings · #23\", grouped under the plan's option), or the option worked by editing as it is; the app goes to it, and the later stages run on it (those approved already go to review again). One undo step; the designer can reopen it.",
    kind: 'edit',
    input: z.object({ stage, option, specimen }),
    run: async (i) => (await stages()).approveStage(i),
  }),
]

/** For the agent's guide. */
export const guide = `- To search many layouts at once, use the optimizer: getOptimizer lists its templates (what each lets change, aims at and must hold); runOptimizer starts a run in the background (it never changes the design) and waits a little; getSpecimens follows it and lists the best specimens against the design as it is; keepSpecimen makes the one you choose a new option. A run with the template's budget can take minutes: for a first look pass a smaller population and fewer generations, and tell the designer what you ran.
- The optimization goes in stages, seed to leaf (Grid → Buildings → Docks → Roads; any stage may be worked at any time, on what the nearest earlier approved stage kept, which it may move only within its margins): getStages reads the plan of the option in view; runStage works a stage (a run; a stage worked by the agent may be worked by editing a copy of its input instead); evaluateStage says what a specimen or that copy does against the stage's input; approveStage keeps it as the stage's option, the later stages running on it. A stage worked by hand is the designer's. Approve when the designer asked you to work the stage, only what holds every must-hold, and say what you approved and why.`
