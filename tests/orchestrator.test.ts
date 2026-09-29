import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { JsonStore } from '../src/main/store'
import { Orchestrator } from '../src/main/orchestrator'

function setup(status: string, exitCode = 0): { store: JsonStore; orch: Orchestrator } {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-'))
  const store = new JsonStore(dataDir)
  const s = store.getSettings()
  s.agentMcpServers = {}
  s.defaultRunStyle = 'headless'
  s.workspaces.manualRoot = path.join(dataDir, 'work')
  s.agents.claude = {
    command: process.execPath,
    args: [path.resolve('tests/fake-agent.mjs'), '{workspace}', status, String(exitCode)],
    interactiveArgs: [path.resolve('tests/fake-interactive-agent.mjs'), '{workspace}']
  }
  store.saveSettings(s)
  const orch = new Orchestrator(store, { dataDir, playbooksDir: path.resolve('resources/playbooks'), mcpServersDir: '' })
  return { store, orch }
}

async function waitFor(check: () => boolean, what: string, ms = 8000): Promise<void> {
  for (let t = 0; t < ms; t += 50) {
    if (check()) return
    await new Promise((r) => setTimeout(r, 50))
  }
  throw new Error(`timed out waiting for ${what}`)
}

const settle = (store: JsonStore, id: string): Promise<void> =>
  waitFor(() => !store.getTask(id)?.activeRunId, 'agent to finish')

describe('Orchestrator', () => {
  it('moving to Running starts the agent and a review result lands in Review', async () => {
    const { store, orch } = setup('review')
    const t = store.createTask({ title: 'Fix it' })
    orch.moveTask(t.id, 'running')
    expect(store.getTask(t.id)?.activeRunId).toBeTruthy()
    await settle(store, t.id)
    expect(store.getTask(t.id)?.state).toBe('review')
    const run = store.listRuns(t.id)[0]
    expect(run).toMatchObject({ status: 'succeeded', summary: 'summary review' })
    expect(run.artifacts[0]).toMatchObject({ type: 'scl', ref: '123' })
    expect(store.readLog(run.id)).toContain('fake agent: review')
    expect(fs.existsSync(path.join(orch.workspaceFor(t.id), '.orchestrator', 'PROMPT.md'))).toBe(true)
    // Manual task without a chosen folder works in <manualRoot>/<title>.
    expect(run.cwd).toBe(path.join(store.getSettings().workspaces.manualRoot, 'Fix-it'))
    expect(fs.existsSync(run.cwd)).toBe(true)
  })

  it('interactive session: detects a prompt, takes input, applies the result and closes', async () => {
    const { store, orch } = setup('review')
    orch.startScheduler(60_000)
    try {
      const t = store.createTask({ title: 'Interactive', runStyle: 'interactive' })
      orch.moveTask(t.id, 'running')
      const runId = store.getTask(t.id)!.activeRunId!
      await waitFor(() => !!store.getTask(t.id)?.waitingInput, 'waiting-for-input flag')
      expect(orch.attach(runId)).toMatchObject({ alive: true, interactive: true })
      expect(orch.attach(runId).text).toContain('Do you want to proceed?')
      orch.write(runId, 'y\r')
      expect(store.getTask(t.id)?.waitingInput).toBeUndefined()
      await waitFor(() => store.getTask(t.id)?.state === 'review', 'Review state')
      expect(store.getRun(runId)).toMatchObject({ status: 'succeeded', summary: 'approved with y', style: 'interactive' })
      await waitFor(() => orch.runningCount() === 0, 'session to close')
    } finally {
      orch.shutdown()
    }
  })

  it('needs_user keeps the task in Running with a question', async () => {
    const { store, orch } = setup('needs_user')
    const t = store.createTask({ title: 'Vendor bug' })
    orch.moveTask(t.id, 'running')
    await settle(store, t.id)
    expect(store.getTask(t.id)).toMatchObject({ state: 'running', needsUser: 'Raise a Qualcomm case?' })
  })

  it('a failing agent sends the task back to To do and switches it to manual', async () => {
    const { store, orch } = setup('none', 3)
    const t = store.createTask({ title: 'Broken', mode: 'auto' })
    orch.moveTask(t.id, 'running')
    await settle(store, t.id)
    expect(store.getTask(t.id)).toMatchObject({ state: 'todo', mode: 'manual' })
    expect(store.getTask(t.id)?.lastError).toContain('code 3')
  })

  it('human-only tasks move to Running without starting an agent', () => {
    const { store, orch } = setup('review')
    const t = store.createTask({ title: 'Manual work', agent: 'none' })
    orch.moveTask(t.id, 'running')
    expect(store.getTask(t.id)?.state).toBe('running')
    expect(store.getTask(t.id)?.activeRunId).toBeUndefined()
  })

  it('auto mode picks up auto tasks by priority within the concurrency limit', async () => {
    const { store, orch } = setup('review')
    store.saveSettings({ ...store.getSettings(), autoMode: true, maxConcurrentRuns: 1 })
    const low = store.createTask({ title: 'low', mode: 'auto', priority: 'low' })
    const crit = store.createTask({ title: 'crit', mode: 'auto', priority: 'critical' })
    store.createTask({ title: 'manual one', mode: 'manual' })
    orch.tick()
    expect(store.getTask(crit.id)?.state).toBe('running')
    expect(store.getTask(low.id)?.state).toBe('todo')
    await settle(store, crit.id)
  })

  it('an unknown CLI fails cleanly', async () => {
    const { store, orch } = setup('review')
    const s = store.getSettings()
    s.agents.claude.command = 'definitely-not-a-real-cli-xyz'
    store.saveSettings(s)
    const t = store.createTask({ title: 'x' })
    orch.moveTask(t.id, 'running')
    await settle(store, t.id)
    expect(store.getTask(t.id)?.state).toBe('todo')
    expect(store.getTask(t.id)?.lastError).toMatch(/Could not start/)
  })
})
