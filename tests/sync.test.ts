import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { JsonStore } from '../src/main/store'
import { syncAll } from '../src/main/sources/sync'

describe('PLM sync over MCP (mock server)', () => {
  it('imports PLMs from an MCP tool and maps their types', async () => {
    const store = new JsonStore(fs.mkdtempSync(path.join(os.tmpdir(), 'orch-')))
    const s = store.getSettings()
    s.sources.plm = {
      ...s.sources.plm,
      enabled: true,
      server: { type: 'stdio', command: process.execPath, args: [path.resolve('scripts/mock-plm-mcp.mjs')] },
      tool: 'list_my_plms'
    }
    const [report] = await syncAll(store, s, { mcpServersDir: '', python: 'python3' })
    expect(report).toMatchObject({ source: 'plm', ok: true, added: 4 })
    const types = store.listTasks().map((t) => t.plmType).sort()
    expect(types).toEqual(['BIGDATA', 'CVE', 'GVOC', 'SET'])
    const again = await syncAll(store, s, { mcpServersDir: '', python: 'python3' })
    expect(again[0]).toMatchObject({ added: 0, updated: 4 })
  }, 20000)

  it('reports a TBD server address as a readable error', async () => {
    const store = new JsonStore(fs.mkdtempSync(path.join(os.tmpdir(), 'orch-')))
    const s = store.getSettings()
    s.sources.plm.enabled = true
    const [report] = await syncAll(store, s, { mcpServersDir: '', python: 'python3' })
    expect(report.ok).toBe(false)
    expect(report.error).toMatch(/TBD/)
  })
})
