export type TaskState = 'todo' | 'running' | 'review' | 'completed'
export const TASK_STATES: TaskState[] = ['todo', 'running', 'review', 'completed']
export const STATE_LABELS: Record<TaskState, string> = {
  todo: 'To do',
  running: 'Running',
  review: 'Review',
  completed: 'Completed'
}

export type TaskSource = 'manual' | 'github' | 'plm'

/** PLM categories. UNKNOWN is used until the PLM MCP field mapping is confirmed (TBD). */
export type PlmType = 'CVE' | 'GVOC' | 'BIGDATA' | 'SET' | 'UNKNOWN'

export type AgentId = 'claude' | 'codex' | 'gemini'
/** 'default' = use settings.defaultAgent, 'none' = human-only task (moving to Running starts nothing). */
export type TaskAgent = AgentId | 'default' | 'none'

export type TaskMode = 'auto' | 'manual'
/** interactive = real CLI in a terminal tab (you can answer prompts); headless = background, log only. */
export type RunStyle = 'interactive' | 'headless'
export type Priority = 'low' | 'normal' | 'high' | 'critical'

export interface Task {
  id: string
  title: string
  description: string
  state: TaskState
  source: TaskSource
  externalId?: string
  externalUrl?: string
  plmType?: PlmType
  priority: Priority
  mode: TaskMode
  agent: TaskAgent
  /** Playbook file name without extension; empty = picked from source/type. */
  playbook?: string
  /**
   * Folder the agent works in, chosen by the user. When empty it is derived from the source:
   * PLM → <plmRoot>/<PLM id>, GitHub → the repo's clone, manual → <manualRoot>/<title>.
   */
  repoPath?: string
  /** Empty = settings.defaultRunStyle. */
  runStyle?: RunStyle
  /** Interactive session seems to be waiting for an answer or approval in its terminal. */
  waitingInput?: boolean
  labels: string[]
  /** Set when the agent stopped and needs a human (e.g. Qualcomm case, missing logs). */
  needsUser?: string
  lastError?: string
  activeRunId?: string
  createdAt: string
  updatedAt: string
  /** Raw payload from the source, kept for playbooks and debugging. */
  raw?: unknown
}

export type NewTaskInput = Pick<Task, 'title'> &
  Partial<Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'activeRunId'>>

export type RunStatus = 'running' | 'succeeded' | 'needs_user' | 'failed' | 'cancelled'

export interface Artifact {
  type: 'scl' | 'pr' | 'patch' | 'report' | 'other'
  ref: string
  note?: string
}

export interface Run {
  id: string
  taskId: string
  agent: AgentId
  playbook: string
  style: RunStyle
  cwd: string
  status: RunStatus
  startedAt: string
  endedAt?: string
  exitCode?: number | null
  summary?: string
  question?: string
  artifacts: Artifact[]
  userReply?: string
}

/** Contract every agent must follow: write this JSON to the result file before exiting. */
export interface AgentResult {
  status: 'review' | 'needs_user' | 'failed'
  summary: string
  question?: string
  artifacts?: Artifact[]
}

export type McpServerConfig =
  | { type: 'stdio'; command: string; args?: string[]; env?: Record<string, string> }
  | { type: 'http'; url: string; headers?: Record<string, string> }

export interface AgentProfile {
  /** Executable name or path, e.g. "claude". */
  command: string
  /**
   * Argument template. Placeholders: {prompt} {promptFile} {workspace} {cwd} {mcpConfig}.
   * An argument that is exactly "{mcpConfigArgs}" expands to the MCP flags (Claude only) or is dropped.
   */
  args: string[]
  /** Arguments for interactive terminal sessions (same placeholders). */
  interactiveArgs: string[]
}

export interface GithubSourceConfig {
  enabled: boolean
  server: McpServerConfig
  /** MCP tool used to list issues. The official github-mcp-server exposes "search_issues". */
  tool: string
  /** Each query becomes one tool call, e.g. "repo:org/app is:open assignee:@me". */
  queries: string[]
}

/** Generic "call one MCP tool and map the result to tasks" config. The PLM mapping is TBD. */
export interface PlmSourceConfig {
  enabled: boolean
  server: McpServerConfig
  tool: string
  toolArgs: Record<string, unknown>
  /** Dot path to the array of items inside the tool's JSON result ("" = result is the array). */
  itemsPath: string
  fields: {
    id: string
    title: string
    description: string
    type: string
    url: string
    priority: string
  }
  /** Maps raw PLM category values to our PlmType, e.g. { "Security": "CVE" }. */
  typeMap: Record<string, PlmType>
}

export interface WorkspaceSettings {
  /** Each PLM gets <plmRoot>/<PLM id>. */
  plmRoot: string
  /** Clones are looked up as <githubRoot>/<repo name> unless listed in githubRepos. */
  githubRoot: string
  /** "owner/repo" → local clone path. */
  githubRepos: Record<string, string>
  /** New manual tasks without a chosen folder get <manualRoot>/<title>. */
  manualRoot: string
}

export interface Settings {
  defaultAgent: AgentId
  defaultRunStyle: RunStyle
  workspaces: WorkspaceSettings
  autoMode: boolean
  maxConcurrentRuns: number
  syncIntervalMinutes: number
  agents: Record<AgentId, AgentProfile>
  /** MCP servers handed to the agent (Claude via --mcp-config). */
  agentMcpServers: Record<string, McpServerConfig>
  sources: {
    github: GithubSourceConfig
    plm: PlmSourceConfig
  }
}

export interface SyncReport {
  source: TaskSource
  ok: boolean
  added: number
  updated: number
  error?: string
  at: string
}

export interface AppInfo {
  dataDir: string
  playbooksDir: string
  mcpServersDir: string
  version: string
  playbooks: string[]
}

/** Everything the renderer can call. Implemented in main, exposed by preload. */
export interface OrchestratorApi {
  info(): Promise<AppInfo>
  listTasks(): Promise<Task[]>
  createTask(input: NewTaskInput): Promise<Task>
  updateTask(id: string, patch: Partial<Task>): Promise<Task>
  deleteTask(id: string): Promise<void>
  moveTask(id: string, to: TaskState): Promise<Task>
  startRun(id: string, userReply?: string): Promise<Run>
  stopRun(id: string): Promise<void>
  listRuns(taskId: string): Promise<Run[]>
  readRunLog(runId: string): Promise<string>
  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<Settings>
  syncNow(): Promise<SyncReport[]>
  lastSync(): Promise<SyncReport[]>
  openPath(path: string): Promise<void>
  openExternal(url: string): Promise<void>
  taskWorkspace(id: string): Promise<string>
  /** Where the agent will work for this task (explicit folder or derived from settings). */
  workFolder(id: string): Promise<string>
  /** Suggested work folder for a task that does not exist yet. */
  previewWorkFolder(input: NewTaskInput): Promise<string>
  chooseFolder(defaultPath?: string): Promise<string | undefined>
  /** Snapshot of a run's terminal output; live data follows via onTerminalData. */
  attachTerminal(runId: string): Promise<{ text: string; alive: boolean; interactive: boolean }>
  writeTerminal(runId: string, data: string): Promise<void>
  resizeTerminal(runId: string, cols: number, rows: number): Promise<void>
  onTasksChanged(cb: () => void): () => void
  onTerminalData(cb: (runId: string, data: string) => void): () => void
  onSync(cb: (reports: SyncReport[]) => void): () => void
}
