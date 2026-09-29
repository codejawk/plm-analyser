import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppInfo, Settings, SyncReport, Task, TaskSource } from '@shared/types'
import { Board } from './components/Board'
import { TaskDrawer } from './components/TaskDrawer'
import { NewTaskDialog } from './components/NewTaskDialog'
import { SettingsView } from './components/SettingsView'
import { ToolsView } from './components/ToolsView'
import { TerminalTab } from './components/TerminalTab'

type View = 'board' | 'tools' | 'settings' | 'terminal'
interface TermTab {
  taskId: string
  runId?: string
}
type Filter = 'all' | TaskSource

export function App(): React.JSX.Element {
  const [tasks, setTasks] = useState<Task[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [view, setView] = useState<View>('board')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [syncReports, setSyncReports] = useState<SyncReport[]>([])
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tabs, setTabs] = useState<TermTab[]>([])
  const [activeTab, setActiveTab] = useState<string | null>(null)

  const refresh = useCallback(() => {
    void window.api.listTasks().then(setTasks)
  }, [])

  useEffect(() => {
    refresh()
    void window.api.getSettings().then(setSettings)
    void window.api.info().then(setInfo)
    void window.api.lastSync().then(setSyncReports)
    const offTasks = window.api.onTasksChanged(refresh)
    const offSync = window.api.onSync(setSyncReports)
    return () => {
      offTasks()
      offSync()
    }
  }, [refresh])

  const guard = useCallback(async <T,>(p: Promise<T>): Promise<T | undefined> => {
    try {
      return await p
    } catch (e) {
      setError(cleanError(e))
      return undefined
    }
  }, [])

  const counts = useMemo(() => {
    const c = { all: tasks.length, plm: 0, github: 0, manual: 0 }
    for (const t of tasks) c[t.source]++
    return c
  }, [tasks])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks.filter(
      (t) =>
        (filter === 'all' || t.source === filter) &&
        (!q || t.title.toLowerCase().includes(q) || (t.externalId ?? '').toLowerCase().includes(q))
    )
  }, [tasks, filter, search])

  const selected = tasks.find((t) => t.id === selectedId) ?? null

  // Drop tabs whose task was deleted.
  useEffect(() => {
    setTabs((ts) => ts.filter((t) => tasks.some((x) => x.id === t.taskId)))
  }, [tasks])

  const openTerminal = useCallback((taskId: string, runId?: string) => {
    setTabs((ts) => {
      const rest = ts.filter((t) => t.taskId !== taskId)
      const existing = ts.find((t) => t.taskId === taskId)
      return existing ? ts.map((t) => (t.taskId === taskId ? { taskId, runId } : t)) : [...rest, { taskId, runId }]
    })
    setActiveTab(taskId)
    setView('terminal')
  }, [])

  function closeTab(taskId: string): void {
    setTabs((ts) => ts.filter((t) => t.taskId !== taskId))
    if (activeTab === taskId) {
      setActiveTab(null)
      setView('board')
    }
  }

  function selectCard(id: string): void {
    const t = tasks.find((x) => x.id === id)
    // Clicking a card whose agent is working opens its live terminal.
    if (t?.activeRunId) openTerminal(id)
    else setSelectedId(id)
  }

  const activeTask = view === 'terminal' ? tasks.find((t) => t.id === activeTab) : undefined
  const activeTabInfo = tabs.find((t) => t.taskId === activeTab)
  const running = tasks.filter((t) => t.activeRunId).length

  async function toggleAuto(on: boolean): Promise<void> {
    if (!settings) return
    const saved = await guard(window.api.saveSettings({ ...settings, autoMode: on }))
    if (saved) setSettings(saved)
  }

  async function syncNow(): Promise<void> {
    setSyncing(true)
    const r = await guard(window.api.syncNow())
    setSyncing(false)
    if (r) {
      setSyncReports(r)
      const failed = r.filter((x) => !x.ok)
      if (!r.length) setError('No sources are enabled. Turn on GitHub or PLM in Settings.')
      else if (failed.length) setError(failed.map((f) => `${f.source}: ${f.error}`).join('\n'))
    }
  }

  const lastSyncText = syncReports.length
    ? `Synced ${new Date(syncReports[0].at).toLocaleTimeString()}`
    : 'Not synced yet'

  const navItem = (key: Filter, label: string): React.JSX.Element => (
    <button
      className={`nav ${view === 'board' && filter === key ? 'on' : ''}`}
      onClick={() => {
        setView('board')
        setFilter(key)
      }}
    >
      {label}
      <span className="count">{counts[key]}</span>
    </button>
  )

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" />
          Task Orchestrator
        </div>
        {navItem('all', 'All tasks')}
        {navItem('plm', 'PLM')}
        {navItem('github', 'GitHub')}
        {navItem('manual', 'Manual')}
        <div className="sep" />
        <button className={`nav ${view === 'tools' ? 'on' : ''}`} onClick={() => setView('tools')}>
          Tools &amp; knowledge
        </button>
        <button className={`nav ${view === 'settings' ? 'on' : ''}`} onClick={() => setView('settings')}>
          Settings
        </button>

        {settings && (
          <div className="auto-box">
            <label className="switch">
              <span>Auto mode</span>
              <input type="checkbox" checked={settings.autoMode} onChange={(e) => void toggleAuto(e.target.checked)} />
            </label>
            <div className="muted">
              {settings.autoMode
                ? `Picks up To-do tasks set to "auto", up to ${settings.maxConcurrentRuns} at a time.`
                : 'Off. Agents only start when you drag a task to Running or press Run.'}
            </div>
            <div className="muted">
              {running} agent{running === 1 ? '' : 's'} running · default {settings.defaultAgent}
            </div>
          </div>
        )}
      </aside>

      <main className="main">
        {tabs.length > 0 && (
          <div className="tabbar">
            <button className={`tab ${view === 'board' ? 'on' : ''}`} onClick={() => setView('board')}>
              Board
            </button>
            {tabs.map((tab) => {
              const t = tasks.find((x) => x.id === tab.taskId)
              if (!t) return null
              return (
                <div key={tab.taskId} className={`tab ${view === 'terminal' && activeTab === tab.taskId ? 'on' : ''}`}>
                  <button
                    className="tab-label"
                    onClick={() => {
                      setActiveTab(tab.taskId)
                      setView('terminal')
                    }}
                    title={t.title}
                  >
                    {t.activeRunId && <span className={`spin ${t.waitingInput ? 'warn' : ''}`} />}
                    {t.title}
                  </button>
                  <button className="tab-close" onClick={() => closeTab(tab.taskId)} aria-label="Close tab">
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {view === 'terminal' && activeTask && (
          <TerminalTab
            key={activeTask.id}
            task={activeTask}
            runId={activeTabInfo?.runId}
            onDetails={() => {
              setSelectedId(activeTask.id)
              setView('board')
            }}
            onError={(e) => setError(cleanError(e))}
          />
        )}
        {view === 'board' && (
          <>
            <div className="toolbar">
              <input placeholder="Search tasks" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="spacer" />
              <span className="muted">{lastSyncText}</span>
              <button onClick={() => void syncNow()} disabled={syncing}>
                {syncing ? 'Syncing…' : 'Sync now'}
              </button>
              <button className="primary" onClick={() => setCreating(true)}>
                + New task
              </button>
            </div>
            <div className={`workarea ${selected ? 'with-drawer' : ''}`}>
              <Board
                tasks={visible}
                selectedId={selectedId}
                onSelect={selectCard}
                onMove={(id, to) => void guard(window.api.moveTask(id, to))}
              />
              {selected && info && (
                <TaskDrawer
                  key={selected.id}
                  task={selected}
                  playbooks={info.playbooks}
                  onOpenTerminal={(runId) => openTerminal(selected.id, runId)}
                  onClose={() => setSelectedId(null)}
                  onError={(e) => setError(cleanError(e))}
                />
              )}
            </div>
          </>
        )}
        {view === 'settings' && settings && info && (
          <SettingsView
            settings={settings}
            info={info}
            onSaved={setSettings}
            onError={(e) => setError(cleanError(e))}
          />
        )}
        {view === 'tools' && settings && info && <ToolsView settings={settings} info={info} />}
      </main>

      {creating && info && (
        <NewTaskDialog
          playbooks={info.playbooks}
          onCancel={() => setCreating(false)}
          onCreate={async (input) => {
            const t = await guard(window.api.createTask(input))
            if (t) {
              setCreating(false)
              setSelectedId(t.id)
            }
          }}
        />
      )}

      {error && (
        <div className="toast" role="alert">
          <div style={{ whiteSpace: 'pre-wrap', flex: 1 }}>{error}</div>
          <button className="ghost" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

export function cleanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
