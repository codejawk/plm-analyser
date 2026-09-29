import { useEffect, useState } from 'react'
import {
  STATE_LABELS,
  TASK_STATES,
  type PlmType,
  type Priority,
  type Run,
  type RunStyle,
  type Task,
  type TaskAgent,
  type TaskMode,
  type TaskState
} from '@shared/types'
import { RunPill, SourcePill } from './bits'

interface Props {
  task: Task
  playbooks: string[]
  onOpenTerminal: (runId?: string) => void
  onClose: () => void
  onError: (e: unknown) => void
}

export function TaskDrawer({ task, playbooks, onOpenTerminal, onClose, onError }: Props): React.JSX.Element {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [repoPath, setRepoPath] = useState(task.repoPath ?? '')
  const [reply, setReply] = useState('')
  const [runs, setRuns] = useState<Run[]>([])
  const [workFolder, setWorkFolder] = useState('')

  useEffect(() => {
    void window.api.listRuns(task.id).then(setRuns)
  }, [task.id, task.activeRunId, task.updatedAt])

  useEffect(() => {
    void window.api.workFolder(task.id).then(setWorkFolder)
  }, [task.id, task.repoPath, task.source, task.externalId, task.title])

  const save = (patch: Partial<Task>): void => {
    window.api.updateTask(task.id, patch).catch(onError)
  }
  const latest = runs[0]

  return (
    <aside className="drawer">
      <div className="drawer-head">
        <div className="row">
          <SourcePill task={task} />
          {task.externalId && <span className="muted mono">{task.externalId}</span>}
          <div style={{ flex: 1 }} />
          <button className="ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <input
          className="title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== task.title && save({ title: title.trim() })}
        />
        <div className="row">
          <select
            value={task.state}
            onChange={(e) => window.api.moveTask(task.id, e.target.value as TaskState).catch(onError)}
            style={{ width: 'auto' }}
            aria-label="State"
          >
            {TASK_STATES.map((s) => (
              <option key={s} value={s}>
                {STATE_LABELS[s]}
              </option>
            ))}
          </select>
          {task.activeRunId ? (
            <button className="danger" onClick={() => window.api.stopRun(task.id).catch(onError)}>
              ■ Stop agent
            </button>
          ) : (
            <button
              className="primary"
              onClick={() =>
                window.api
                  .startRun(task.id)
                  .then((r) => onOpenTerminal(r.id))
                  .catch(onError)
              }
            >
              ▶ Run agent
            </button>
          )}
          {task.externalUrl && (
            <button onClick={() => window.api.openExternal(task.externalUrl!).catch(onError)}>Open ↗</button>
          )}
          {runs.length > 0 && <button onClick={() => onOpenTerminal()}>Terminal</button>}
          <button onClick={() => window.api.openPath(workFolder).catch(onError)}>Folder</button>
        </div>
      </div>

      <div className="drawer-body">
        {task.needsUser && (
          <div className="callout warn">
            <strong>The agent needs you</strong>
            <div style={{ whiteSpace: 'pre-wrap' }}>{task.needsUser}</div>
            <textarea
              rows={3}
              placeholder="Reply (e.g. Qualcomm case number, extra logs path, a decision)…"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
            <div className="row">
              {task.activeRunId && (
              <div>The session is still open — you can answer in its terminal instead.</div>
            )}
            <button
                className="primary"
                onClick={() => {
                  if (!reply.trim()) return onError(new Error('Write a reply first.'))
                  window.api
                    .startRun(task.id, reply.trim())
                    .then((r) => {
                      setReply('')
                      onOpenTerminal(r.id)
                    })
                    .catch(onError)
                }}
              >
                Reply &amp; resume agent
              </button>
              <button onClick={() => window.api.moveTask(task.id, 'review').catch(onError)}>Move to Review</button>
            </div>
          </div>
        )}
        {task.lastError && !task.activeRunId && task.state === 'todo' && (
          <div className="callout err">
            <strong>Last run failed</strong>
            <div style={{ whiteSpace: 'pre-wrap' }}>{task.lastError}</div>
          </div>
        )}

        <div className="grid2">
          <label className="field">
            Mode
            <select value={task.mode} onChange={(e) => save({ mode: e.target.value as TaskMode })}>
              <option value="manual">Manual — I start it</option>
              <option value="auto">Auto — scheduler starts it</option>
            </select>
          </label>
          <label className="field">
            Agent
            <select value={task.agent} onChange={(e) => save({ agent: e.target.value as TaskAgent })}>
              <option value="default">Default</option>
              <option value="claude">Claude CLI</option>
              <option value="codex">Codex CLI</option>
              <option value="gemini">Gemini CLI</option>
              <option value="none">Human only</option>
            </select>
          </label>
          <label className="field">
            Playbook
            <select value={task.playbook ?? ''} onChange={(e) => save({ playbook: e.target.value || undefined })}>
              <option value="">Automatic</option>
              {playbooks.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Priority
            <select value={task.priority} onChange={(e) => save({ priority: e.target.value as Priority })}>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </label>
          {task.source === 'plm' && (
            <label className="field">
              PLM type
              <select value={task.plmType ?? 'UNKNOWN'} onChange={(e) => save({ plmType: e.target.value as PlmType })}>
                <option value="CVE">CVE</option>
                <option value="GVOC">GVOC</option>
                <option value="BIGDATA">Big data</option>
                <option value="SET">Set issue</option>
                <option value="UNKNOWN">Unknown (TBD)</option>
              </select>
            </label>
          )}
          <label className="field">
            Run in
            <select
              value={task.runStyle ?? ''}
              onChange={(e) => save({ runStyle: (e.target.value || undefined) as RunStyle | undefined })}
            >
              <option value="">Default</option>
              <option value="interactive">Terminal — I can answer prompts</option>
              <option value="headless">Background — log only</option>
            </select>
          </label>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            Work folder
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input
                className="mono"
                placeholder={workFolder}
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                onBlur={() => repoPath !== (task.repoPath ?? '') && save({ repoPath: repoPath.trim() || undefined })}
              />
              <button
                onClick={() =>
                  window.api
                    .chooseFolder(repoPath || workFolder)
                    .then((p) => {
                      if (p) {
                        setRepoPath(p)
                        save({ repoPath: p })
                      }
                    })
                    .catch(onError)
                }
              >
                Browse…
              </button>
            </div>
            <span className="muted">
              {task.repoPath ? 'Chosen folder.' : 'Automatic from Settings → Work folders. Pick a folder to override.'}
            </span>
          </div>
        </div>

        <label className="field">
          Description
          <textarea
            rows={6}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== task.description && save({ description })}
          />
        </label>

        {latest?.summary && !task.activeRunId && (
          <div className="callout info">
            <strong>Latest result</strong>
            <div style={{ whiteSpace: 'pre-wrap' }}>{latest.summary}</div>
          </div>
        )}
        {latest && latest.artifacts.length > 0 && (
          <div className="panel" style={{ padding: 10 }}>
            <h3>Artifacts</h3>
            {latest.artifacts.map((a, i) => (
              <div key={i} className="row">
                <span className="pill neutral">{a.type.toUpperCase()}</span>
                <span className="mono">{a.ref}</span>
                {a.note && <span className="muted">{a.note}</span>}
              </div>
            ))}
          </div>
        )}

        <div className="runs">
          <h3>Agent runs</h3>
          {runs.length === 0 && <div className="muted">No runs yet. Press Run agent or drag the card to Running.</div>}
          {runs.map((r) => (
            <div key={r.id} className="run-row" onClick={() => onOpenTerminal(r.id)} title="Open in terminal tab">
              <RunPill status={r.status} />
              <span>{r.agent}</span>
              <span className="muted">{r.style === 'headless' ? 'background' : 'terminal'}</span>
              <span className="muted" style={{ marginLeft: 'auto' }}>
                {new Date(r.startedAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button
            className="danger"
            onClick={() => {
              if (confirm(`Delete "${task.title}" and its run history?`)) {
                window.api
                  .deleteTask(task.id)
                  .then(onClose)
                  .catch(onError)
              }
            }}
          >
            Delete task
          </button>
        </div>
      </div>
    </aside>
  )
}
