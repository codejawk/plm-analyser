import type { RunStatus, Task } from '@shared/types'

const PLM_LABEL: Record<string, string> = {
  CVE: 'CVE',
  GVOC: 'GVOC',
  BIGDATA: 'Big data',
  SET: 'Set issue',
  UNKNOWN: 'type TBD'
}

export function SourcePill({ task }: { task: Task }): React.JSX.Element {
  if (task.source === 'plm')
    return <span className="pill plm">PLM · {PLM_LABEL[task.plmType ?? 'UNKNOWN']}</span>
  if (task.source === 'github') return <span className="pill github">GitHub</span>
  return <span className="pill manual">Manual</span>
}

const RUN_PILL: Record<RunStatus, [string, string]> = {
  running: ['run', 'Running'],
  succeeded: ['ok', 'Ready for review'],
  needs_user: ['warn', 'Needs you'],
  failed: ['err', 'Failed'],
  cancelled: ['neutral', 'Cancelled']
}

export function RunPill({ status }: { status: RunStatus }): React.JSX.Element {
  const [cls, label] = RUN_PILL[status]
  return <span className={`pill ${cls}`}>{label}</span>
}

export function linesToList(s: string): string[] {
  return s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
}
