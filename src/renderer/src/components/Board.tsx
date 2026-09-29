import { useState } from 'react'
import { STATE_LABELS, TASK_STATES, type Task, type TaskState } from '@shared/types'
import { SourcePill } from './bits'

interface Props {
  tasks: Task[]
  selectedId: string | null
  onSelect: (id: string) => void
  onMove: (id: string, to: TaskState) => void
}

const PRIORITY_ORDER = { critical: 0, high: 1, normal: 2, low: 3 }

export function Board({ tasks, selectedId, onSelect, onMove }: Props): React.JSX.Element {
  const [dropTarget, setDropTarget] = useState<TaskState | null>(null)

  return (
    <div className="board">
      {TASK_STATES.map((state) => {
        const items = tasks
          .filter((t) => t.state === state)
          .sort(
            (a, b) =>
              PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.updatedAt.localeCompare(a.updatedAt)
          )
        return (
          <section
            key={state}
            className={`column ${dropTarget === state ? 'drop' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDropTarget(state)
            }}
            onDragLeave={() => setDropTarget((s) => (s === state ? null : s))}
            onDrop={(e) => {
              e.preventDefault()
              setDropTarget(null)
              const id = e.dataTransfer.getData('text/task-id')
              if (id) onMove(id, state)
            }}
          >
            <div className="column-head">
              <span>{STATE_LABELS[state]}</span>
              <span className="muted">{items.length}</span>
            </div>
            <div className="column-body">
              {items.length === 0 && <div className="empty">Drop tasks here</div>}
              {items.map((t) => (
                <TaskCard key={t.id} task={t} selected={t.id === selectedId} onSelect={onSelect} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function TaskCard({
  task,
  selected,
  onSelect
}: {
  task: Task
  selected: boolean
  onSelect: (id: string) => void
}): React.JSX.Element {
  return (
    <article
      className={`card ${selected ? 'sel' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/task-id', task.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => onSelect(task.id)}
    >
      <div className="card-meta">
        <SourcePill task={task} />
        {task.priority !== 'normal' && <span className={`prio-${task.priority}`}>{task.priority}</span>}
        <span style={{ marginLeft: 'auto' }}>{task.mode === 'auto' ? 'auto' : 'manual'}</span>
      </div>
      <div className="card-title">{task.title}</div>
      <CardStatus task={task} />
    </article>
  )
}

function CardStatus({ task }: { task: Task }): React.JSX.Element | null {
  if (task.activeRunId && task.waitingInput)
    return (
      <div className="card-meta" style={{ color: 'var(--warn)' }}>
        <span className="spin warn" /> Waiting for your input — click to answer
      </div>
    )
  if (task.activeRunId)
    return (
      <div className="card-meta" style={{ color: 'var(--accent)' }}>
        <span className="spin" /> Agent working — click for terminal
      </div>
    )
  if (task.needsUser)
    return (
      <div className="card-meta" style={{ color: 'var(--warn)' }}>
        ⚑ Needs you
      </div>
    )
  if (task.lastError && task.state === 'todo')
    return (
      <div className="card-meta" style={{ color: 'var(--danger)' }}>
        ✕ Last run failed
      </div>
    )
  return null
}
