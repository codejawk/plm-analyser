import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { OrchestratorApi } from '@shared/types'

function listen<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const fn = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as A))
  ipcRenderer.on(channel, fn)
  return () => ipcRenderer.removeListener(channel, fn)
}

const api: OrchestratorApi = {
  info: () => ipcRenderer.invoke('info'),
  listTasks: () => ipcRenderer.invoke('tasks:list'),
  createTask: (input) => ipcRenderer.invoke('tasks:create', input),
  updateTask: (id, patch) => ipcRenderer.invoke('tasks:update', id, patch),
  deleteTask: (id) => ipcRenderer.invoke('tasks:delete', id),
  moveTask: (id, to) => ipcRenderer.invoke('tasks:move', id, to),
  startRun: (id, reply) => ipcRenderer.invoke('runs:start', id, reply),
  stopRun: (id) => ipcRenderer.invoke('runs:stop', id),
  listRuns: (taskId) => ipcRenderer.invoke('runs:list', taskId),
  readRunLog: (runId) => ipcRenderer.invoke('runs:log', runId),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  syncNow: () => ipcRenderer.invoke('sync:now'),
  lastSync: () => ipcRenderer.invoke('sync:last'),
  openPath: (p) => ipcRenderer.invoke('open:path', p),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  taskWorkspace: (id) => ipcRenderer.invoke('tasks:workspace', id),
  workFolder: (id) => ipcRenderer.invoke('tasks:workFolder', id),
  previewWorkFolder: (input) => ipcRenderer.invoke('tasks:previewWorkFolder', input),
  chooseFolder: (defaultPath) => ipcRenderer.invoke('dialog:folder', defaultPath),
  attachTerminal: (runId) => ipcRenderer.invoke('term:attach', runId),
  writeTerminal: (runId, data) => ipcRenderer.invoke('term:write', runId, data),
  resizeTerminal: (runId, cols, rows) => ipcRenderer.invoke('term:resize', runId, cols, rows),
  onTasksChanged: (cb) => listen('tasks:changed', cb),
  onTerminalData: (cb) => listen('term:data', cb),
  onSync: (cb) => listen('sync', cb)
}

contextBridge.exposeInMainWorld('api', api)
