import { useState } from 'react'
import type { AgentId, AppInfo, RunStyle, Settings, WorkspaceSettings } from '@shared/types'
import { linesToList } from './bits'

interface Props {
  settings: Settings
  info: AppInfo
  onSaved: (s: Settings) => void
  onError: (e: unknown) => void
}

const AGENTS: AgentId[] = ['claude', 'codex', 'gemini']
const json = (v: unknown): string => JSON.stringify(v, null, 2)

/** Settings are edited as a draft; complex parts are JSON so new MCP servers need no code change. */
export function SettingsView({ settings, info, onSaved, onError }: Props): React.JSX.Element {
  const [s, setS] = useState<Settings>(settings)
  const [agentArgs, setAgentArgs] = useState(
    Object.fromEntries(AGENTS.map((a) => [a, settings.agents[a].args.join('\n')])) as Record<AgentId, string>
  )
  const [interactiveArgs, setInteractiveArgs] = useState(
    Object.fromEntries(AGENTS.map((a) => [a, settings.agents[a].interactiveArgs.join('\n')])) as Record<AgentId, string>
  )
  const [githubRepos, setGithubRepos] = useState(json(settings.workspaces.githubRepos))
  const [toolServers, setToolServers] = useState(json(settings.agentMcpServers))
  const [ghServer, setGhServer] = useState(json(settings.sources.github.server))
  const [ghQueries, setGhQueries] = useState(settings.sources.github.queries.join('\n'))
  const [plmServer, setPlmServer] = useState(json(settings.sources.plm.server))
  const [plmArgs, setPlmArgs] = useState(json(settings.sources.plm.toolArgs))
  const [plmFields, setPlmFields] = useState(json(settings.sources.plm.fields))
  const [plmTypeMap, setPlmTypeMap] = useState(json(settings.sources.plm.typeMap))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)

  function parse<T>(key: string, text: string, errs: Record<string, string>): T | undefined {
    try {
      return JSON.parse(text) as T
    } catch (e) {
      errs[key] = `Invalid JSON: ${(e as Error).message}`
      return undefined
    }
  }

  async function save(): Promise<void> {
    const errs: Record<string, string> = {}
    const next: Settings = {
      ...s,
      agents: Object.fromEntries(
        AGENTS.map((a) => [
          a,
          {
            command: s.agents[a].command.trim(),
            args: linesToList(agentArgs[a]),
            interactiveArgs: linesToList(interactiveArgs[a])
          }
        ])
      ) as Settings['agents'],
      workspaces: {
        ...s.workspaces,
        githubRepos: parse('githubRepos', githubRepos, errs) ?? s.workspaces.githubRepos
      },
      agentMcpServers: parse('toolServers', toolServers, errs) ?? s.agentMcpServers,
      sources: {
        github: {
          ...s.sources.github,
          server: parse('ghServer', ghServer, errs) ?? s.sources.github.server,
          queries: linesToList(ghQueries)
        },
        plm: {
          ...s.sources.plm,
          server: parse('plmServer', plmServer, errs) ?? s.sources.plm.server,
          toolArgs: parse('plmArgs', plmArgs, errs) ?? s.sources.plm.toolArgs,
          fields: parse('plmFields', plmFields, errs) ?? s.sources.plm.fields,
          typeMap: parse('plmTypeMap', plmTypeMap, errs) ?? s.sources.plm.typeMap
        }
      }
    }
    if (next.maxConcurrentRuns < 1) errs.concurrency = 'Must be at least 1.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    try {
      const r = await window.api.saveSettings(next)
      setS(r)
      onSaved(r)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      onError(e)
    }
  }

  const err = (k: string): React.JSX.Element | null =>
    errors[k] ? <span style={{ color: 'var(--danger)', fontSize: 12 }}>{errors[k]}</span> : null
  const setWs = (p: Partial<WorkspaceSettings>): void => setS({ ...s, workspaces: { ...s.workspaces, ...p } })
  const folderField = (key: 'plmRoot' | 'githubRoot' | 'manualRoot', label: string, hint: string): React.JSX.Element => (
    <div className="field">
      {label}
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input className="mono" value={s.workspaces[key]} onChange={(e) => setWs({ [key]: e.target.value })} />
        <button
          onClick={() =>
            window.api
              .chooseFolder(s.workspaces[key])
              .then((p) => p && setWs({ [key]: p }))
              .catch(onError)
          }
        >
          Browse…
        </button>
      </div>
      <span className="muted">{hint}</span>
    </div>
  )
  const gh = s.sources.github
  const plm = s.sources.plm
  const setGh = (p: Partial<Settings['sources']['github']>): void =>
    setS({ ...s, sources: { ...s.sources, github: { ...gh, ...p } } })
  const setPlm = (p: Partial<Settings['sources']['plm']>): void =>
    setS({ ...s, sources: { ...s.sources, plm: { ...plm, ...p } } })

  return (
    <div className="page">
      <div className="row">
        <h2>Settings</h2>
        <div style={{ flex: 1 }} />
        {saved && <span className="pill ok">Saved</span>}
        {Object.keys(errors).length > 0 && <span className="pill err">Fix the errors below</span>}
        <button className="primary" onClick={() => void save()}>
          Save settings
        </button>
      </div>

      <section className="panel">
        <h3>General</h3>
        <div className="grid2">
          <label className="field">
            Default agent
            <select value={s.defaultAgent} onChange={(e) => setS({ ...s, defaultAgent: e.target.value as AgentId })}>
              <option value="claude">Claude CLI</option>
              <option value="codex">Codex CLI</option>
              <option value="gemini">Gemini CLI</option>
            </select>
          </label>
          <label className="field">
            Run agents in
            <select value={s.defaultRunStyle} onChange={(e) => setS({ ...s, defaultRunStyle: e.target.value as RunStyle })}>
              <option value="interactive">Terminal — you can answer prompts and approvals</option>
              <option value="headless">Background — log only, no approvals possible</option>
            </select>
          </label>
          <label className="field">
            Max agents running at once (auto mode)
            <input
              type="number"
              min={1}
              step={1}
              value={s.maxConcurrentRuns}
              onChange={(e) => setS({ ...s, maxConcurrentRuns: Math.round(Number(e.target.value)) })}
            />
            {err('concurrency')}
          </label>
          <label className="field">
            Sync every (minutes, 0 = only manual)
            <input
              type="number"
              min={0}
              step={1}
              value={s.syncIntervalMinutes}
              onChange={(e) => setS({ ...s, syncIntervalMinutes: Math.round(Number(e.target.value)) })}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <h3>Work folders</h3>
        <div className="muted">
          Where each task's agent works, unless a folder is chosen on the task itself. Folders are created when needed.
        </div>
        {folderField('plmRoot', 'PLM root', 'Each PLM works in <PLM root>/<PLM id>. Logs and reports go there.')}
        {folderField('githubRoot', 'GitHub clones root', 'An issue from owner/repo works in <root>/<repo>; the agent clones it there if empty.')}
        <label className="field">
          GitHub repo → existing clone (overrides the root)
          <textarea
            className="code"
            rows={4}
            value={githubRepos}
            onChange={(e) => setGithubRepos(e.target.value)}
            placeholder='{ "org/app": "D:/src/app" }'
          />
          {err('githubRepos')}
        </label>
        {folderField('manualRoot', 'Manual tasks root', 'A new task without a chosen folder works in <root>/<task title>.')}
      </section>

      <section className="panel">
        <h3>Agent CLIs</h3>
        <div className="muted">
          One argument per line. Placeholders: {'{prompt}'} {'{promptFile}'} {'{workspace}'} {'{cwd}'} {'{mcpConfig}'}.
          A line with only {'{mcpConfigArgs}'} adds the tool servers below (Claude only; Codex and Gemini read MCP
          servers from their own config files).
        </div>
        {AGENTS.map((a) => (
          <div key={a} className="grid2" style={{ gridTemplateColumns: '180px 1fr' }}>
            <label className="field">
              {a} command
              <input
                className="mono"
                value={s.agents[a].command}
                onChange={(e) => setS({ ...s, agents: { ...s.agents, [a]: { ...s.agents[a], command: e.target.value } } })}
              />
            </label>
            <div className="grid2">
              <label className="field">
                Terminal arguments
                <textarea
                  className="code"
                  rows={5}
                  value={interactiveArgs[a]}
                  onChange={(e) => setInteractiveArgs({ ...interactiveArgs, [a]: e.target.value })}
                />
              </label>
              <label className="field">
                Background arguments
                <textarea
                  className="code"
                  rows={5}
                  value={agentArgs[a]}
                  onChange={(e) => setAgentArgs({ ...agentArgs, [a]: e.target.value })}
                />
              </label>
            </div>
          </div>
        ))}
      </section>

      <section className="panel">
        <h3>Tool servers for agents (MCP)</h3>
        <div className="muted">
          Parser, T32, knowledge base, P4, CodeGrok and PLM servers the agent can call. {'{mcpServersDir}'} ={' '}
          <span className="mono">{info.mcpServersDir}</span>, {'{python}'} = python / python3,{' '}
          {'${env:NAME}'} = environment variable.
        </div>
        <textarea className="code" rows={12} value={toolServers} onChange={(e) => setToolServers(e.target.value)} />
        {err('toolServers')}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>GitHub source</h3>
          <div style={{ flex: 1 }} />
          <label className="switch">
            Enabled <input type="checkbox" checked={gh.enabled} onChange={(e) => setGh({ enabled: e.target.checked })} />
          </label>
        </div>
        <div className="muted">
          Uses the official github-mcp-server. Set GITHUB_TOKEN in your environment (for GitHub Enterprise also set
          GITHUB_HOST in the server env).
        </div>
        <label className="field">
          MCP server
          <textarea className="code" rows={8} value={ghServer} onChange={(e) => setGhServer(e.target.value)} />
          {err('ghServer')}
        </label>
        <div className="grid2">
          <label className="field">
            Tool
            <input className="mono" value={gh.tool} onChange={(e) => setGh({ tool: e.target.value })} />
          </label>
          <label className="field">
            Search queries (one per line)
            <textarea className="code" rows={3} value={ghQueries} onChange={(e) => setGhQueries(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>PLM source</h3>
          <span className="tbd">TBD</span>
          <div style={{ flex: 1 }} />
          <label className="switch">
            Enabled <input type="checkbox" checked={plm.enabled} onChange={(e) => setPlm({ enabled: e.target.checked })} />
          </label>
        </div>
        <div className="muted">
          Waiting for the PLM MCP server address, tool name and response format. Fill these in once shared; no code
          change is needed if the tool returns a JSON list.
        </div>
        <label className="field">
          MCP server
          <textarea className="code" rows={5} value={plmServer} onChange={(e) => setPlmServer(e.target.value)} />
          {err('plmServer')}
        </label>
        <div className="grid2">
          <label className="field">
            Tool that lists my PLMs
            <input className="mono" value={plm.tool} onChange={(e) => setPlm({ tool: e.target.value })} />
          </label>
          <label className="field">
            Path to the list in the result
            <input className="mono" value={plm.itemsPath} onChange={(e) => setPlm({ itemsPath: e.target.value })} />
          </label>
          <label className="field">
            Tool arguments
            <textarea className="code" rows={4} value={plmArgs} onChange={(e) => setPlmArgs(e.target.value)} />
            {err('plmArgs')}
          </label>
          <label className="field">
            Field mapping
            <textarea className="code" rows={8} value={plmFields} onChange={(e) => setPlmFields(e.target.value)} />
            {err('plmFields')}
          </label>
          <label className="field" style={{ gridColumn: '1 / -1' }}>
            PLM category → type (CVE, GVOC, BIGDATA, SET)
            <textarea className="code" rows={6} value={plmTypeMap} onChange={(e) => setPlmTypeMap(e.target.value)} />
            {err('plmTypeMap')}
          </label>
        </div>
      </section>

      <section className="panel">
        <h3>Folders</h3>
        <div className="row">
          <span className="muted" style={{ width: 90 }}>Data</span>
          <span className="mono" style={{ flex: 1 }}>{info.dataDir}</span>
          <button onClick={() => window.api.openPath(info.dataDir).catch(onError)}>Open</button>
        </div>
        <div className="row">
          <span className="muted" style={{ width: 90 }}>Playbooks</span>
          <span className="mono" style={{ flex: 1 }}>{info.playbooksDir}</span>
          <button onClick={() => window.api.openPath(info.playbooksDir).catch(onError)}>Open</button>
        </div>
        <div className="muted">Edit playbooks there to change how agents approach each task type. Restart to pick up new files.</div>
      </section>
    </div>
  )
}
