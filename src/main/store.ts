import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { NewTaskInput, Run, Settings, Task, TaskSource } from '@shared/types'
import { mergeSettings } from './defaults'

/**
 * Storage boundary. Today it is a local JSON file per user; a shared team server can
 * implement the same interface later without touching the rest of the app.
 */
export interface Store {
  listTasks(): Task[]
  getTask(id: string): Task | undefined
  createTask(input: NewTaskInput): Task
  updateTask(id: string, patch: Partial<Task>): Task
  deleteTask(id: string): void
  findExternal(source: TaskSource, externalId: string): Task | undefined

  listRuns(taskId: string): Run[]
  getRun(id: string): Run | undefined
  createRun(run: Omit<Run, 'id'>): Run
  updateRun(id: string, patch: Partial<Run>): Run
  appendLog(runId: string, text: string): void
  readLog(runId: string): string

  getSettings(): Settings
  saveSettings(settings: Settings): Settings
}

interface DbFile {
  version: 1
  tasks: Task[]
  runs: Run[]
  settings?: Partial<Settings>
}

export class JsonStore implements Store {
  private db: DbFile
  private readonly dbPath: string
  private readonly logsDir: string

  constructor(private readonly dataDir: string) {
    fs.mkdirSync(dataDir, { recursive: true })
    this.dbPath = path.join(dataDir, 'db.json')
    this.logsDir = path.join(dataDir, 'logs')
    fs.mkdirSync(this.logsDir, { recursive: true })
    this.db = this.load()
    this.recoverInterruptedRuns()
  }

  private load(): DbFile {
    if (!fs.existsSync(this.dbPath)) return { version: 1, tasks: [], runs: [] }
    const parsed = JSON.parse(fs.readFileSync(this.dbPath, 'utf8')) as DbFile
    return { version: 1, tasks: parsed.tasks ?? [], runs: parsed.runs ?? [], settings: parsed.settings }
  }

  private save(): void {
    const tmp = this.dbPath + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 2))
    fs.renameSync(tmp, this.dbPath)
  }

  /** Runs that were "running" when the app closed can never finish; mark them and free the task. */
  private recoverInterruptedRuns(): void {
    let changed = false
    for (const run of this.db.runs) {
      if (run.status === 'running') {
        run.status = 'cancelled'
        run.endedAt = new Date().toISOString()
        run.summary = 'App closed while the agent was running.'
        changed = true
      }
    }
    for (const task of this.db.tasks) {
      if (task.activeRunId) {
        task.activeRunId = undefined
        task.lastError = 'App closed while the agent was running.'
        changed = true
      }
    }
    if (changed) this.save()
  }

  listTasks(): Task[] {
    return this.db.tasks.map((t) => ({ ...t }))
  }

  getTask(id: string): Task | undefined {
    const t = this.db.tasks.find((x) => x.id === id)
    return t ? { ...t } : undefined
  }

  findExternal(source: TaskSource, externalId: string): Task | undefined {
    const t = this.db.tasks.find((x) => x.source === source && x.externalId === externalId)
    return t ? { ...t } : undefined
  }

  createTask(input: NewTaskInput): Task {
    const now = new Date().toISOString()
    const task: Task = {
      description: '',
      state: 'todo',
      source: 'manual',
      priority: 'normal',
      mode: 'manual',
      agent: 'default',
      labels: [],
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    }
    this.db.tasks.push(task)
    this.save()
    return { ...task }
  }

  updateTask(id: string, patch: Partial<Task>): Task {
    const idx = this.db.tasks.findIndex((x) => x.id === id)
    if (idx < 0) throw new Error(`Task not found: ${id}`)
    const { id: _id, createdAt: _c, ...rest } = patch
    const next = { ...this.db.tasks[idx], ...rest, updatedAt: new Date().toISOString() }
    this.db.tasks[idx] = next
    this.save()
    return { ...next }
  }

  deleteTask(id: string): void {
    const runIds = this.db.runs.filter((r) => r.taskId === id).map((r) => r.id)
    this.db.tasks = this.db.tasks.filter((x) => x.id !== id)
    this.db.runs = this.db.runs.filter((r) => r.taskId !== id)
    for (const runId of runIds) fs.rmSync(this.logPath(runId), { force: true })
    this.save()
  }

  listRuns(taskId: string): Run[] {
    return this.db.runs
      .filter((r) => r.taskId === taskId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((r) => ({ ...r }))
  }

  getRun(id: string): Run | undefined {
    const r = this.db.runs.find((x) => x.id === id)
    return r ? { ...r } : undefined
  }

  createRun(run: Omit<Run, 'id'>): Run {
    const created: Run = { ...run, id: randomUUID() }
    this.db.runs.push(created)
    this.save()
    return { ...created }
  }

  updateRun(id: string, patch: Partial<Run>): Run {
    const idx = this.db.runs.findIndex((x) => x.id === id)
    if (idx < 0) throw new Error(`Run not found: ${id}`)
    this.db.runs[idx] = { ...this.db.runs[idx], ...patch, id }
    this.save()
    return { ...this.db.runs[idx] }
  }

  private logPath(runId: string): string {
    return path.join(this.logsDir, `${runId}.log`)
  }

  appendLog(runId: string, text: string): void {
    fs.appendFileSync(this.logPath(runId), text)
  }

  readLog(runId: string): string {
    const p = this.logPath(runId)
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
  }

  getSettings(): Settings {
    return mergeSettings(this.db.settings)
  }

  saveSettings(settings: Settings): Settings {
    this.db.settings = settings
    this.save()
    return this.getSettings()
  }
}
