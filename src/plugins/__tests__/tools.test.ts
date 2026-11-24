// The plugins' tools (Decision "Plugin tools"): each name is its own, none a core tool's; the MCP server reads by
// folder the same tools and guide the manifests give the app; the host offers them with the core's and refuses a call
// while their plugin is off in this browser.
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { pluginTools as serverTools } from '../../../mcp/plugins.ts'
import { TOOLS } from '../../api/tools/index.ts'
import { derive } from '../../engine/derive.ts'
import { demoProject } from '../../state/demo.ts'
import { emptyHistory } from '../../state/history.ts'
import { useApp } from '../../state/store.ts'
import { AGENT_GUIDE, callTool, toolSchemas } from '../host.ts'
import { PLUGINS } from '../registry.ts'
import { PLUGINS_KEY, usePluginModes } from '../settings.ts'
import { pluginGuide, pluginTools } from '../tools.ts'

beforeEach(() => {
  const p = demoProject()
  useApp.setState({ project: p, derived: derive(p), history: emptyHistory(), dragStart: null })
  usePluginModes.setState({ modes: {} })
  localStorage.removeItem(PLUGINS_KEY)
})

describe('plugin tools', () => {
  it('have names of their own: unique, and none a core tool’s', () => {
    const names = pluginTools().map((x) => x.tool.name)
    expect(names).toEqual(expect.arrayContaining(['getOptimizer', 'runOptimizer', 'getSpecimens', 'keepSpecimen']))
    expect(new Set(names).size).toBe(names.length)
    expect(names.filter((n) => TOOLS.some((t) => t.name === n))).toEqual([])
  })

  it('the MCP server reads by folder what the manifests give the app', async () => {
    const server = await serverTools(path.resolve('src/plugins'))
    expect(server.failed).toEqual([])
    expect(server.schemas.map((s) => s.name).sort()).toEqual(pluginTools().map((x) => x.tool.name).sort())
    expect(server.guide.split('\n').sort()).toEqual(pluginGuide().split('\n').sort())
    // a plugin with tools has them in tools/index.ts (else the server would not see them)
    expect(PLUGINS.filter((p) => p.tools?.length).map((p) => p.id)).toEqual(['optimizer'])
  })

  it('the host offers them with the core’s and tells the agent how to use them, unless their plugin is off', async () => {
    expect(toolSchemas().map((s) => s.name)).toEqual(expect.arrayContaining(['getProject', 'runOptimizer']))
    expect(AGENT_GUIDE).toContain('runOptimizer')
    usePluginModes.getState().setMode('optimizer', 'off')
    expect(toolSchemas().map((s) => s.name)).not.toContain('runOptimizer')
    expect(await callTool('getOptimizer', {})).toEqual({ ok: false, error: expect.stringMatching(/Optimizer is off in this browser/) })
  })

  it('checks a call’s input before it runs', async () => {
    expect(await callTool('keepSpecimen', { specimen: 'one' })).toEqual({ ok: false, error: expect.stringMatching(/^keepSpecimen: /) })
  })
})
