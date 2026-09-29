import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'
import type { AgentId, AgentResult, Priority, Run, RunStyle, Task, TaskState } from '@shared/types'
import type { Store } from './store'
import { buildPrompt, pickPlaybook, shortPrompt } from './playbooks'
import { expandArgs, readResultFile, resolveServerConfig, toClaudeMcpJson } from './agents/cli'
import { type Session, startHeadless, startInteractive } from './agents/session'
import { resolveWorkFolder } from './workfolders'

export interface OrchestratorPaths {
  dataDir: string
  playbooksDir: string
  mcpServersDir: string
}

interface ActiveRun {
  taskId: string
  session: Session
  cancelled: boolean
  finished: boolean
  /** Terminal output since the run started, for tabs that attach later. */
  buffer: string
  lastDataAt: number
  resultMtime: number
  resultFile: string
}

const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, normal: 2, low: 3 }
const MAX_BUFFER = 4 * 1024 * 1024
/** Tail text that suggests the CLI is waiting for the user (approval, trust prompt, question). */
const WAITING_RE =
  /(Do you want to|Do you trust|Allow (this|once|always|execution)|Yes, (allow|and don't ask)|\bapprove\b|Would you like|\(y\/n\)|\[y\/N\]|\[Y\/n\]|Press Enter|waiting for (your )?(input|approval)|Esc to cancel)/i

export function pythonCommand(): string {
  return process.platform === 'win32' ? 'python' : 'python3'
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07]*(\x07|\x1b\\)|\x1b[@-Z\\-_]/g
export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

/**
 * Owns task state transitions and agent sessions.
 *
 * Rules:
 * - A user can move any task to any state.
 * - Moving into Running starts the task's agent (unless the task is human-only).
 * - Moving out of Running stops its agent.
 * - Agent result: review → Review, needs_user → stays Running flagged, failure → To do.
 * - Interactive sessions: the result file is watched while the terminal is open; `needs_user`
 *   flags the card and keeps the session so the user can answer in the terminal.
 */
export class Orchestrator extends EventEmitter {
  private active = new Map<string, ActiveRun>()
  private timers: NodeJS.Timeout[] = []

  constructor(
    private readonly store: Store,
    private readonly paths: OrchestratorPaths
  ) {
    super()
  }

  private changed(): void {
    this.emit('tasks')
  }

  /** Internal per-task folder: prompt, result file, MCP config. */
  workspaceFor(taskId: string): string {
    return path.join(this.paths.dataDir, 'workspaces', taskId)
  }

  workFolderFor(task: Task): string {
    return resolveWorkFolder(task, this.store.getSettings().workspaces)
  }

  resolveAgent(task: Task): AgentId | undefined {
    if (task.agent === 'none') return undefined
    if (task.agent === 'default') return this.store.getSettings().defaultAgent
    return task.agent
  }

  resolveStyle(task: Task): RunStyle {
    return task.runStyle ?? this.store.getSettings().defaultRunStyle
  }

  moveTask(id: string, to: TaskState): Task {
    const task = this.store.getTask(id)
    if (!task) throw new Error(`Task not found: ${id}`)
    if (task.state === to) return task

    const patch: Partial<Task> = { state: to }
    if (task.state === 'running' && task.activeRunId) {
      this.cancel(task.activeRunId)
      patch.activeRunId = undefined
    }
    if (to !== 'running') {
      patch.needsUser = undefined
      patch.waitingInput = undefined
    }
    let updated = this.store.updateTask(id, patch)

    if (to === 'running' && this.resolveAgent(updated) && !updated.activeRunId) {
      this.startRun(id)
      updated = this.store.getTask(id)!
    }
    this.changed()
    return updated
  }

  startRun(taskId: string, userReply?: string): Run {
    const task = this.store.getTask(taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)
    if (task.activeRunId && this.active.has(task.activeRunId)) throw new Error('An agent is already running this task.')
    const agent = this.resolveAgent(task)
    if (!agent) throw new Error('This task is set to "human only". Pick an agent in the task details first.')

    const settings = this.store.getSettings()
    const profile = settings.agents[agent]
    const style = this.resolveStyle(task)
    const workspace = this.workspaceFor(task.id)
    const metaDir = path.join(workspace, '.orchestrator')
    fs.mkdirSync(metaDir, { recursive: true })

    const cwd = this.workFolderFor(task)
    fs.mkdirSync(cwd, { recursive: true })
    const resultFile = path.join(metaDir, 'result.json')
    fs.rmSync(resultFile, { force: true })

    const previous = this.store.listRuns(task.id)[0]
    const playbook = pickPlaybook(task)
    const ctx = {
      task,
      workspace,
      cwd,
      resultFile,
      interactive: style === 'interactive',
      userReply,
      previousSummary: userReply ? previous?.summary || previous?.question : undefined
    }
    const promptFile = path.join(metaDir, 'PROMPT.md')
    fs.writeFileSync(promptFile, buildPrompt(this.paths.playbooksDir, playbook, ctx))
    fs.writeFileSync(path.join(metaDir, 'task.json'), JSON.stringify(task, null, 2))

    const servers = Object.fromEntries(
      Object.entries(settings.agentMcpServers).map(([name, cfg]) => [
        name,
        resolveServerConfig(cfg, { mcpServersDir: this.paths.mcpServersDir, python: pythonCommand() })
      ])
    )
    let mcpConfig: string | undefined
    if (Object.keys(servers).length) {
      mcpConfig = path.join(metaDir, 'mcp.json')
      fs.writeFileSync(mcpConfig, toClaudeMcpJson(servers))
    }

    const template = style === 'interactive' ? profile.interactiveArgs : profile.args
    const args = expandArgs(agent, template, {
      prompt: shortPrompt(ctx, promptFile),
      promptFile,
      workspace,
      cwd,
      mcpConfig,
      mcpServerNames: Object.keys(servers)
    })

    const run = this.store.createRun({
      taskId: task.id,
      agent,
      playbook,
      style,
      cwd,
      status: 'running',
      startedAt: new Date().toISOString(),
      artifacts: [],
      userReply
    })
    this.store.updateTask(task.id, {
      state: 'running',
      activeRunId: run.id,
      needsUser: undefined,
      waitingInput: undefined,
      lastError: undefined
    })

    const session = (style === 'interactive' ? startInteractive : startHeadless)({
      command: profile.command,
      args,
      cwd,
      env: process.env
    })
    const handle: ActiveRun = {
      taskId: task.id,
      session,
      cancelled: false,
      finished: false,
      buffer: '',
      lastDataAt: Date.now(),
      resultMtime: 0,
      resultFile
    }
    this.active.set(run.id, handle)

    const header = `\x1b[2m■ ${agent} · ${style} · playbook "${playbook}"\r\n■ folder ${cwd}\x1b[0m\r\n\r\n`
    this.output(run.id, header)
    session.onData((d) => {
      handle.lastDataAt = Date.now()
      this.output(run.id, d)
    })
    session.onExit((code, error) => {
      if (handle.finished) {
        this.active.delete(run.id)
        return
      }
      this.finish(run.id, code, error ? `Could not start "${profile.command}": ${error}` : undefined)
    })

    this.changed()
    return this.store.getRun(run.id)!
  }

  private output(runId: string, data: string): void {
    const h = this.active.get(runId)
    if (h) {
      h.buffer += data
      if (h.buffer.length > MAX_BUFFER) h.buffer = h.buffer.slice(-MAX_BUFFER)
    }
    this.store.appendLog(runId, data)
    this.emit('term', runId, data)
  }

  /** Snapshot for a terminal tab. Live data follows through the 'term' event. */
  attach(runId: string): { text: string; alive: boolean; interactive: boolean } {
    const h = this.active.get(runId)
    const run = this.store.getRun(runId)
    if (h && !h.finished) return { text: h.buffer, alive: true, interactive: h.session.interactive }
    return { text: this.store.readLog(runId), alive: false, interactive: run?.style === 'interactive' }
  }

  write(runId: string, data: string): void {
    const h = this.active.get(runId)
    if (!h || h.finished) return
    h.session.write(data)
    const task = this.store.getTask(h.taskId)
    if (task?.waitingInput) {
      this.store.updateTask(h.taskId, { waitingInput: undefined })
      this.changed()
    }
  }

  resize(runId: string, cols: number, rows: number): void {
    this.active.get(runId)?.session.resize(Math.floor(cols), Math.floor(rows))
  }

  /** Applies an agent result to the run and task. Returns true when the session should end. */
  private applyResult(runId: string, result: AgentResult | undefined, exitCode: number | null, startError?: string): boolean {
    const run = this.store.getRun(runId)
    if (!run) return true
    const task = this.store.getTask(run.taskId)
    const endedAt = new Date().toISOString()
    const outcome = result?.status ?? (startError || exitCode !== 0 ? 'failed' : 'review')
    const summary =
      startError ??
      result?.summary ??
      (exitCode === 0 ? 'Agent finished without writing a result file. Check the terminal output.' : `Agent exited with code ${exitCode}.`)

    if (outcome === 'needs_user') {
      const question = result?.question || summary
      this.store.updateRun(runId, { summary, question, artifacts: result?.artifacts ?? [] })
      if (task) this.store.updateTask(task.id, { needsUser: question })
      // Interactive sessions stay open so the user can answer in the terminal.
      const h = this.active.get(runId)
      if (h && h.session.interactive && exitCode === null && !startError) {
        this.changed()
        return false
      }
      this.store.updateRun(runId, { status: 'needs_user', endedAt, exitCode })
      if (task) this.store.updateTask(task.id, { activeRunId: undefined, waitingInput: undefined })
    } else if (outcome === 'review') {
      this.store.updateRun(runId, { status: 'succeeded', endedAt, exitCode, summary, artifacts: result?.artifacts ?? [] })
      if (task) this.store.updateTask(task.id, { state: 'review', activeRunId: undefined, needsUser: undefined, waitingInput: undefined })
    } else {
      this.store.updateRun(runId, { status: 'failed', endedAt, exitCode, summary, artifacts: result?.artifacts ?? [] })
      // Switch to manual so auto mode does not retry a failing task forever.
      if (task)
        this.store.updateTask(task.id, {
          state: 'todo',
          activeRunId: undefined,
          lastError: summary,
          mode: 'manual',
          needsUser: undefined,
          waitingInput: undefined
        })
    }
    this.output(runId, `\r\n\x1b[1m■ ${outcome}: ${summary}\x1b[0m\r\n`)
    this.changed()
    return true
  }

  private finish(runId: string, exitCode: number | null, startError?: string): void {
    const handle = this.active.get(runId)
    if (handle?.finished) return
    if (handle) handle.finished = true
    const run = this.store.getRun(runId)
    if (!run) return

    if (handle?.cancelled) {
      this.store.updateRun(runId, { status: 'cancelled', endedAt: new Date().toISOString(), exitCode, summary: 'Stopped by user.' })
      const task = this.store.getTask(run.taskId)
      if (task?.activeRunId === runId) this.store.updateTask(task.id, { activeRunId: undefined, waitingInput: undefined })
      this.output(runId, '\r\n■ stopped\r\n')
      this.active.delete(runId)
      this.changed()
      return
    }

    const result = startError ? undefined : readResultFile(path.join(this.workspaceFor(run.taskId), '.orchestrator', 'result.json'))
    this.applyResult(runId, result, exitCode, startError)
    this.active.delete(runId)
  }

  /** Interactive sessions: react to result files and detect prompts waiting for the user. */
  private watchSessions(): void {
    for (const [runId, h] of this.active) {
      if (h.finished || !h.session.interactive) continue

      let mtime = 0
      try {
        mtime = fs.statSync(h.resultFile).mtimeMs
      } catch {
        /* not written yet */
      }
      if (mtime && mtime !== h.resultMtime) {
        h.resultMtime = mtime
        const result = readResultFile(h.resultFile)
        if (result && this.applyResult(runId, result, null)) {
          h.finished = true
          // Leave a moment for the CLI's last output, then close the session.
          setTimeout(() => h.session.kill(), 1500)
          continue
        }
      }

      const idle = Date.now() - h.lastDataAt > 2500
      const task = this.store.getTask(h.taskId)
      if (task && idle && !task.waitingInput && WAITING_RE.test(stripAnsi(h.buffer.slice(-3000)))) {
        this.store.updateTask(h.taskId, { waitingInput: true })
        this.changed()
      }
    }
  }

  private cancel(runId: string): void {
    const handle = this.active.get(runId)
    if (!handle) {
      // Stale reference (e.g. app restarted); just clear it.
      const run = this.store.getRun(runId)
      if (run?.status === 'running') this.store.updateRun(runId, { status: 'cancelled', endedAt: new Date().toISOString() })
      return
    }
    handle.cancelled = true
    handle.session.kill()
  }

  stopRun(taskId: string): void {
    const task = this.store.getTask(taskId)
    if (!task) return
    if (task.activeRunId) this.cancel(task.activeRunId)
    this.store.updateTask(taskId, {
      activeRunId: undefined,
      waitingInput: undefined,
      ...(task.state === 'running' ? { state: 'todo' as const, needsUser: undefined } : {})
    })
    this.changed()
  }

  runningCount(): number {
    return [...this.active.values()].filter((h) => !h.finished).length
  }

  /** Auto mode: move eligible To-do tasks into Running while there is capacity. */
  tick(): void {
    const settings = this.store.getSettings()
    if (!settings.autoMode) return
    let capacity = settings.maxConcurrentRuns - this.runningCount()
    if (capacity <= 0) return
    const candidates = this.store
      .listTasks()
      .filter((t) => t.state === 'todo' && t.mode === 'auto' && this.resolveAgent(t))
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt.localeCompare(b.createdAt))
    for (const t of candidates) {
      if (capacity <= 0) break
      try {
        this.moveTask(t.id, 'running')
        capacity--
      } catch (e) {
        this.store.updateTask(t.id, { lastError: (e as Error).message, mode: 'manual' })
        this.changed()
      }
    }
  }

  startScheduler(intervalMs = 5000): void {
    this.timers.push(setInterval(() => this.tick(), intervalMs))
    this.timers.push(setInterval(() => this.watchSessions(), 1000))
  }

  shutdown(): void {
    this.timers.forEach(clearInterval)
    for (const id of [...this.active.keys()]) this.cancel(id)
  }
}
