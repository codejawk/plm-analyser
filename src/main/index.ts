import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
import type { NewTaskInput, Settings, SyncReport, Task, TaskState } from '@shared/types'
import { JsonStore } from './store'
import { Orchestrator, pythonCommand } from './orchestrator'
import { installPlaybooks, listPlaybooks } from './playbooks'
import { syncAll } from './sources/sync'
import { resolveWorkFolder } from './workfolders'

// ORCH_DATA_DIR lets a user (or a test) point the app at a different data folder.
const dataDir = process.env.ORCH_DATA_DIR || path.join(app.getPath('userData'), 'data')
const resourcesRoot = app.isPackaged ? process.resourcesPath : app.getAppPath()
const bundledPlaybooks = path.join(resourcesRoot, app.isPackaged ? 'playbooks' : 'resources/playbooks')
const mcpServersDir = path.join(resourcesRoot, 'mcp-servers')
const playbooksDir = path.join(dataDir, 'playbooks')

let win: BrowserWindow | null = null
let store: JsonStore
let orch: Orchestrator
let lastSync: SyncReport[] = []
let syncTimer: NodeJS.Timeout | undefined
let syncing = false

function send(channel: string, ...args: unknown[]): void {
  win?.webContents.send(channel, ...args)
}

async function runSync(): Promise<SyncReport[]> {
  if (syncing) return lastSync
  syncing = true
  try {
    lastSync = await syncAll(store, store.getSettings(), { mcpServersDir, python: pythonCommand() })
    send('sync', lastSync)
    send('tasks:changed')
    return lastSync
  } finally {
    syncing = false
  }
}

function scheduleSync(settings: Settings): void {
  if (syncTimer) clearInterval(syncTimer)
  const anyEnabled = settings.sources.github.enabled || settings.sources.plm.enabled
  if (!anyEnabled || settings.syncIntervalMinutes <= 0) return
  syncTimer = setInterval(() => void runSync(), settings.syncIntervalMinutes * 60_000)
}

function registerIpc(): void {
  const handle = (channel: string, fn: (...args: any[]) => unknown): void => {
    ipcMain.handle(channel, (_e, ...args) => fn(...args))
  }
  handle('info', () => ({
    dataDir,
    playbooksDir,
    mcpServersDir,
    version: app.getVersion(),
    playbooks: listPlaybooks(playbooksDir)
  }))
  handle('tasks:list', () => store.listTasks())
  handle('tasks:create', (input: NewTaskInput) => {
    const t = store.createTask(input)
    send('tasks:changed')
    return t
  })
  handle('tasks:update', (id: string, patch: Partial<Task>) => {
    // State changes go through moveTask so agents start/stop correctly.
    const { state, activeRunId: _a, ...rest } = patch
    let t = store.updateTask(id, rest)
    if (state && state !== t.state) t = orch.moveTask(id, state)
    send('tasks:changed')
    return t
  })
  handle('tasks:delete', (id: string) => {
    orch.stopRun(id)
    store.deleteTask(id)
    fs.rmSync(orch.workspaceFor(id), { recursive: true, force: true })
    send('tasks:changed')
  })
  handle('tasks:move', (id: string, to: TaskState) => orch.moveTask(id, to))
  handle('tasks:workspace', (id: string) => {
    const dir = orch.workspaceFor(id)
    fs.mkdirSync(dir, { recursive: true })
    return dir
  })
  handle('tasks:workFolder', (id: string) => {
    const t = store.getTask(id)
    if (!t) throw new Error('Task not found')
    return orch.workFolderFor(t)
  })
  handle('tasks:previewWorkFolder', (input: NewTaskInput) =>
    resolveWorkFolder({ source: 'manual', ...input }, store.getSettings().workspaces)
  )
  handle('dialog:folder', async (defaultPath?: string) => {
    const r = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: defaultPath && fs.existsSync(defaultPath) ? defaultPath : undefined
    })
    return r.canceled ? undefined : r.filePaths[0]
  })
  handle('term:attach', (runId: string) => orch.attach(runId))
  handle('term:write', (runId: string, data: string) => orch.write(runId, data))
  handle('term:resize', (runId: string, cols: number, rows: number) => orch.resize(runId, cols, rows))
  handle('runs:start', (id: string, reply?: string) => orch.startRun(id, reply))
  handle('runs:stop', (id: string) => orch.stopRun(id))
  handle('runs:list', (taskId: string) => store.listRuns(taskId))
  handle('runs:log', (runId: string) => store.readLog(runId))
  handle('settings:get', () => store.getSettings())
  handle('settings:save', (s: Settings) => {
    const saved = store.saveSettings(s)
    scheduleSync(saved)
    return saved
  })
  handle('sync:now', () => runSync())
  handle('sync:last', () => lastSync)
  handle('open:path', async (p: string) => {
    fs.mkdirSync(p, { recursive: true })
    const err = await shell.openPath(p)
    if (err) throw new Error(err)
  })
  handle('open:external', (url: string) => {
    if (!/^https?:\/\//.test(url)) throw new Error('Only http(s) links can be opened.')
    return shell.openExternal(url)
  })
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 960,
    minHeight: 600,
    title: 'Task Orchestrator',
    backgroundColor: '#f7f6f3',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'))

  // ORCH_SCREENSHOT=<file.png> captures the window once and quits (used for docs and checks).
  const shot = process.env.ORCH_SCREENSHOT
  if (shot) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        // Optional ORCH_SCREENSHOT_JS runs in the page first (e.g. to open a task panel).
        if (process.env.ORCH_SCREENSHOT_JS) {
          await win!.webContents.executeJavaScript(process.env.ORCH_SCREENSHOT_JS)
          await new Promise((r) => setTimeout(r, 800))
        }
        const img = await win!.webContents.capturePage()
        fs.writeFileSync(shot, img.toPNG())
        app.quit()
      }, Number(process.env.ORCH_SCREENSHOT_DELAY ?? 1500))
    })
  }
}

// Two copies writing the same data folder would overwrite each other, so allow only one.
// (A custom ORCH_DATA_DIR is a separate data set and may run alongside.)
if (!process.env.ORCH_DATA_DIR && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })
  app.whenReady().then(start)
}

function start(): void {
  store = new JsonStore(dataDir)
  installPlaybooks(bundledPlaybooks, playbooksDir)
  orch = new Orchestrator(store, { dataDir, playbooksDir, mcpServersDir })
  orch.on('tasks', () => send('tasks:changed'))
  orch.on('term', (runId: string, data: string) => send('term:data', runId, data))
  orch.startScheduler()
  registerIpc()
  scheduleSync(store.getSettings())
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

app.on('before-quit', () => orch?.shutdown())
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
