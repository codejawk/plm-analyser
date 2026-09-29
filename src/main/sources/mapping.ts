import type { NewTaskInput, PlmSourceConfig, PlmType, Priority } from '@shared/types'

/** Reads "a.b.0.c" out of a nested object. "" returns the object itself. */
export function getPath(obj: unknown, p: string): unknown {
  if (!p) return obj
  let cur: any = obj
  for (const key of p.split('.')) {
    if (cur == null) return undefined
    cur = cur[key]
  }
  return cur
}

function str(v: unknown): string {
  if (v == null) return ''
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : JSON.stringify(v)
}

export function toPriority(v: unknown): Priority {
  const s = str(v).toLowerCase()
  if (/crit|blocker|p0|urgent/.test(s)) return 'critical'
  if (/high|major|p1/.test(s)) return 'high'
  if (/low|minor|trivial|p3|p4/.test(s)) return 'low'
  return 'normal'
}

export interface ExternalItem extends NewTaskInput {
  externalId: string
}

/** Maps a PLM MCP tool result to tasks using the configurable field map. */
export function mapPlmItems(result: unknown, cfg: PlmSourceConfig): ExternalItem[] {
  const items = getPath(result, cfg.itemsPath)
  if (!Array.isArray(items)) {
    throw new Error(`PLM result has no array at "${cfg.itemsPath || '(root)'}". Check the field mapping in Settings.`)
  }
  return items
    .map((item): ExternalItem | undefined => {
      const id = str(getPath(item, cfg.fields.id))
      if (!id) return undefined
      const rawType = str(getPath(item, cfg.fields.type))
      const plmType: PlmType = cfg.typeMap[rawType] ?? 'UNKNOWN'
      return {
        externalId: id,
        title: str(getPath(item, cfg.fields.title)) || id,
        description: str(getPath(item, cfg.fields.description)),
        externalUrl: str(getPath(item, cfg.fields.url)) || undefined,
        priority: toPriority(getPath(item, cfg.fields.priority)),
        source: 'plm',
        plmType,
        labels: rawType ? [rawType] : [],
        raw: item
      }
    })
    .filter((x): x is ExternalItem => !!x)
}

/**
 * Maps a GitHub search/list result. Accepts the search shape ({ items: [...] }) and a bare array,
 * which covers the github-mcp-server "search_issues" and "list_issues" tools.
 */
export function mapGithubItems(result: unknown): ExternalItem[] {
  const items = Array.isArray(result)
    ? result
    : Array.isArray(getPath(result, 'items'))
      ? (getPath(result, 'items') as unknown[])
      : Array.isArray(getPath(result, 'issues'))
        ? (getPath(result, 'issues') as unknown[])
        : []
  return items
    .map((it: any): ExternalItem | undefined => {
      const url: string = it.html_url ?? it.url ?? ''
      const repo = repoFromUrl(url) ?? repoFromUrl(it.repository_url ?? '') ?? ''
      if (!it.number) return undefined
      const labels: string[] = (it.labels ?? []).map((l: any) => (typeof l === 'string' ? l : l.name)).filter(Boolean)
      return {
        externalId: `${repo}#${it.number}`,
        title: `${repo ? repo.split('/')[1] + ' ' : ''}#${it.number} ${it.title ?? ''}`.trim(),
        description: it.body ?? '',
        externalUrl: url || undefined,
        priority: toPriority(labels.join(' ')),
        source: 'github',
        labels: it.pull_request ? ['pull request', ...labels] : labels,
        raw: it
      }
    })
    .filter((x): x is ExternalItem => !!x)
}

export function repoFromUrl(url: string): string | undefined {
  const api = url.match(/\/repos\/([^/]+\/[^/]+?)(?:\/|$)/)
  if (api) return api[1]
  return url.match(/^https?:\/\/[^/]+\/([^/]+\/[^/]+)\/(?:issues|pull)\//)?.[1]
}
