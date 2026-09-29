import { useEffect, useState } from 'react'
import type { Run, Task } from '@shared/types'
import { RunPill, SourcePill } from './bits'
import { RunTerminal } from './Terminal'

interface Props {
  task: Task
  /** A specific past run to show; otherwise the active or latest run. */
  runId?: string
  onDetails: () => void
  onError: (e: unknown) => void
}

export function TerminalTab({ task, runId, onDetails, onError }: Props): React.JSX.Element {
  const [runs, setRuns] = useState<Run[]>([])
  const [chosen, setChosen] = useState<string | undefined>(runId)

  useEffect(() => {
    void window.api.listRuns(task.id).then(setRuns)
  }, [task.id, task.activeRunId, task.updatedAt])

  // Follow a newly started run (e.g. after "Reply & resume").
  useEffect(() => {
    if (task.activeRunId) setChosen(task.activeRunId)
  }, [task.activeRunId])

  const current = chosen ?? task.activeRunId ?? runs[0]?.id
  const run = runs.find((r) => r.id === current)
  const live = !!task.activeRunId && task.activeRunId === current

  return (
    <div className="term-tab">
      <div className="term-head">
        <SourcePill task={task} />
        <strong className="term-title">{task.title}</strong>
        {run && <RunPill status={live ? 'running' : run.status} />}
        {task.waitingInput && live && <span className="pill warn">Waiting for your input</span>}
        {task.needsUser && <span className="pill warn">Needs you</span>}
        <div style={{ flex: 1 }} />
        {runs.length > 1 && (
          <select value={current} onChange={(e) => setChosen(e.target.value)} style={{ width: 'auto' }} aria-label="Run">
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {new Date(r.startedAt).toLocaleString()} · {r.agent}
              </option>
            ))}
          </select>
        )}
        {task.activeRunId ? (
          <button className="danger" onClick={() => window.api.stopRun(task.id).catch(onError)}>
            ■ Stop
          </button>
        ) : (
          <button className="primary" onClick={() => window.api.startRun(task.id).catch(onError)}>
            ▶ Run again
          </button>
        )}
        {task.state === 'running' && (
          <button onClick={() => window.api.moveTask(task.id, 'review').catch(onError)}>Move to Review</button>
        )}
        <button
          onClick={() =>
            window.api
              .workFolder(task.id)
              .then((p) => window.api.openPath(p))
              .catch(onError)
          }
        >
          Folder
        </button>
        <button onClick={onDetails}>Details</button>
      </div>
      {run?.cwd && <div className="term-sub mono">{run.cwd}</div>}
      {current ? (
        <RunTerminal key={current} runId={current} />
      ) : (
        <div className="empty" style={{ padding: 40 }}>
          No runs yet. Press Run to start the agent.
        </div>
      )}
    </div>
  )
}
