import os from 'os'
import path from 'path'
import type { NewTaskInput, Task, WorkspaceSettings } from '@shared/types'

export function expandHome(p: string): string {
  if (p === '~') return os.homedir()
  if (p.startsWith('~/') || p.startsWith('~\\')) return path.join(os.homedir(), p.slice(2))
  return p
}

/** Makes a string safe as a single folder name on Windows and macOS. */
export function folderName(s: string, max = 60): string {
  const cleaned = s
    .replace(/[<>:"/\\|?*\x00-\x1f#]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, max)
  return cleaned || 'task'
}

/** "org/app#12" → "org/app" */
export function repoOf(task: Pick<Task, 'externalId'>): string | undefined {
  const m = task.externalId?.match(/^([^#\s]+\/[^#\s]+)#/)
  return m?.[1]
}

/**
 * Where the agent works for a task:
 * - an explicitly chosen folder always wins
 * - PLM:    <plmRoot>/<PLM id>
 * - GitHub: githubRepos["owner/repo"] or <githubRoot>/<repo name> (the agent clones it there if empty)
 * - manual: <manualRoot>/<title>
 */
export function resolveWorkFolder(task: Pick<Task, 'title'> & Pick<NewTaskInput, 'source' | 'externalId' | 'repoPath'>, ws: WorkspaceSettings): string {
  if (task.repoPath?.trim()) return path.resolve(expandHome(task.repoPath.trim()))
  if (task.source === 'plm') {
    return path.join(expandHome(ws.plmRoot), folderName(task.externalId || task.title))
  }
  if (task.source === 'github') {
    const repo = repoOf(task)
    if (repo && ws.githubRepos[repo]) return path.resolve(expandHome(ws.githubRepos[repo]))
    return path.join(expandHome(ws.githubRoot), folderName(repo ? repo.split('/')[1] : task.title))
  }
  return path.join(expandHome(ws.manualRoot), folderName(task.title))
}
