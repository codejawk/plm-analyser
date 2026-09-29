import type { McpServerConfig, Settings, SyncReport, TaskSource } from '@shared/types'
import type { Store } from '../store'
import { resolveServerConfig } from '../agents/cli'
import { callToolJson, withMcpClient } from './mcpClient'
import { type ExternalItem, mapGithubItems, mapPlmItems } from './mapping'

export interface SyncVars {
  mcpServersDir: string
  python: string
}

/**
 * Inserts new items as To-do tasks and refreshes the text of known ones.
 * Never changes the board state of an existing task — that belongs to the user and the agents.
 */
export function upsertItems(store: Store, items: ExternalItem[]): { added: number; updated: number } {
  let added = 0
  let updated = 0
  for (const item of items) {
    const existing = store.findExternal(item.source!, item.externalId)
    if (existing) {
      const { title, description, externalUrl, raw, plmType, labels } = item
      store.updateTask(existing.id, { title, description, externalUrl, raw, plmType, labels })
      updated++
    } else {
      store.createTask({ ...item, state: 'todo', mode: 'manual', agent: 'default' })
      added++
    }
  }
  return { added, updated }
}

async function syncSource(
  source: TaskSource,
  server: McpServerConfig,
  vars: SyncVars,
  fetch: (call: (tool: string, args: Record<string, unknown>) => Promise<unknown>) => Promise<ExternalItem[]>,
  store: Store
): Promise<SyncReport> {
  const at = new Date().toISOString()
  try {
    const items = await withMcpClient(resolveServerConfig(server, vars), (client) =>
      fetch((tool, args) => callToolJson(client, tool, args))
    )
    return { source, ok: true, ...upsertItems(store, items), at }
  } catch (e) {
    return { source, ok: false, added: 0, updated: 0, error: (e as Error).message, at }
  }
}

export async function syncAll(store: Store, settings: Settings, vars: SyncVars): Promise<SyncReport[]> {
  const reports: SyncReport[] = []
  const { github, plm } = settings.sources

  if (github.enabled) {
    reports.push(
      await syncSource(
        'github',
        github.server,
        vars,
        async (call) => {
          const all: ExternalItem[] = []
          for (const query of github.queries) all.push(...mapGithubItems(await call(github.tool, { query })))
          return all
        },
        store
      )
    )
  }

  if (plm.enabled) {
    reports.push(
      await syncSource('plm', plm.server, vars, async (call) => mapPlmItems(await call(plm.tool, plm.toolArgs), plm), store)
    )
  }

  return reports
}
