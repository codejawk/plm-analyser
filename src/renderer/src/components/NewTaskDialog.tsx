import { useEffect, useState } from 'react'
import type { NewTaskInput, PlmType, Priority, RunStyle, TaskAgent, TaskMode, TaskSource } from '@shared/types'

interface Props {
  playbooks: string[]
  onCancel: () => void
  onCreate: (input: NewTaskInput) => void
}

export function NewTaskDialog({ playbooks, onCancel, onCreate }: Props): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState<'manual' | PlmType>('manual')
  const [externalId, setExternalId] = useState('')
  const [priority, setPriority] = useState<Priority>('normal')
  const [mode, setMode] = useState<TaskMode>('manual')
  const [agent, setAgent] = useState<TaskAgent>('default')
  const [playbook, setPlaybook] = useState('')
  const [repoPath, setRepoPath] = useState('')
  const [runStyle, setRunStyle] = useState<RunStyle | ''>('')
  const [titleError, setTitleError] = useState(false)
  const [preview, setPreview] = useState('')
  const source: TaskSource = kind === 'manual' ? 'manual' : 'plm'

  useEffect(() => {
    void window.api
      .previewWorkFolder({ title: title.trim() || 'new-task', source, externalId: externalId.trim() || undefined })
      .then(setPreview)
  }, [title, source, externalId])

  function submit(e: React.FormEvent): void {
    e.preventDefault()
    if (!title.trim()) {
      setTitleError(true)
      return
    }
    onCreate({
      title: title.trim(),
      description,
      source,
      plmType: kind === 'manual' ? undefined : kind,
      externalId: externalId.trim() || undefined,
      priority,
      mode,
      agent,
      playbook: playbook || undefined,
      repoPath: repoPath.trim() || undefined,
      runStyle: runStyle || undefined,
      labels: []
    })
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="modal" onSubmit={submit}>
        <h2>New task</h2>
        <label className="field">
          Title
          <input
            autoFocus
            value={title}
            onChange={(e) => {
              setTitle(e.target.value)
              setTitleError(false)
            }}
          />
          {titleError && <span style={{ color: 'var(--danger)' }}>Enter a title first.</span>}
        </label>
        <label className="field">
          Description
          <textarea
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What should be done? For a PLM entered by hand, paste the issue text and log paths."
          />
        </label>
        <div className="grid2">
          <label className="field">
            Kind
            <select value={kind} onChange={(e) => setKind(e.target.value as 'manual' | PlmType)}>
              <option value="manual">General task</option>
              <option value="CVE">PLM · CVE</option>
              <option value="GVOC">PLM · GVOC</option>
              <option value="BIGDATA">PLM · Big data</option>
              <option value="SET">PLM · Set issue</option>
            </select>
          </label>
          <label className="field">
            {kind === 'manual' ? 'Reference (optional)' : 'PLM ID'}
            <input value={externalId} onChange={(e) => setExternalId(e.target.value)} />
          </label>
          <label className="field">
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="field">
            Mode
            <select value={mode} onChange={(e) => setMode(e.target.value as TaskMode)}>
              <option value="manual">Manual</option>
              <option value="auto">Auto</option>
            </select>
          </label>
          <label className="field">
            Agent
            <select value={agent} onChange={(e) => setAgent(e.target.value as TaskAgent)}>
              <option value="default">Default</option>
              <option value="claude">Claude CLI</option>
              <option value="codex">Codex CLI</option>
              <option value="gemini">Gemini CLI</option>
              <option value="none">Human only</option>
            </select>
          </label>
          <label className="field">
            Playbook
            <select value={playbook} onChange={(e) => setPlaybook(e.target.value)}>
              <option value="">Automatic</option>
              {playbooks.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          Run in
          <select value={runStyle} onChange={(e) => setRunStyle(e.target.value as RunStyle | '')}>
            <option value="">Default (Settings)</option>
            <option value="interactive">Terminal — I can answer prompts and approvals</option>
            <option value="headless">Background — log only</option>
          </select>
        </label>
        <div className="field">
          Work folder — where the agent works
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="mono" placeholder={preview} value={repoPath} onChange={(e) => setRepoPath(e.target.value)} />
            <button
              type="button"
              onClick={() =>
                void window.api.chooseFolder(repoPath || preview).then((p) => p && setRepoPath(p))
              }
            >
              Browse…
            </button>
          </div>
          <span className="muted">Leave empty to use the folder shown (created if missing).</span>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Create task
          </button>
        </div>
      </form>
    </div>
  )
}
