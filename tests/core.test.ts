import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { JsonStore } from '../src/main/store'
import { expandArgs, formatAgentLine, readResultFile, resolveServerConfig } from '../src/main/agents/cli'
import { getPath, mapGithubItems, mapPlmItems } from '../src/main/sources/mapping'
import { upsertItems } from '../src/main/sources/sync'
import { buildPrompt, pickPlaybook } from '../src/main/playbooks'
import { defaultSettings } from '../src/main/defaults'

const tmp = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'orch-'))

describe('JsonStore', () => {
  it('persists tasks and settings across instances', () => {
    const dir = tmp()
    const s1 = new JsonStore(dir)
    const t = s1.createTask({ title: 'A' })
    s1.updateTask(t.id, { state: 'review' })
    s1.saveSettings({ ...s1.getSettings(), maxConcurrentRuns: 5 })
    const s2 = new JsonStore(dir)
    expect(s2.getTask(t.id)?.state).toBe('review')
    expect(s2.getSettings().maxConcurrentRuns).toBe(5)
  })

  it('marks runs left running by a closed app as cancelled', () => {
    const dir = tmp()
    const s1 = new JsonStore(dir)
    const t = s1.createTask({ title: 'A', state: 'running' })
    const r = s1.createRun({ taskId: t.id, agent: 'claude', playbook: 'generic', style: 'headless', cwd: '/tmp', status: 'running', startedAt: new Date().toISOString(), artifacts: [] })
    s1.updateTask(t.id, { activeRunId: r.id })
    const s2 = new JsonStore(dir)
    expect(s2.getRun(r.id)?.status).toBe('cancelled')
    expect(s2.getTask(t.id)?.activeRunId).toBeUndefined()
  })
})

describe('agent CLI helpers', () => {
  const ctx = { prompt: 'do it', promptFile: '/w/P.md', workspace: '/w', cwd: '/repo', mcpConfig: '/w/mcp.json', mcpServerNames: ['log-parser'] }

  it('expands MCP args only for Claude', () => {
    const tpl = ['-p', '{prompt}', '{mcpConfigArgs}', '--add-dir', '{workspace}']
    expect(expandArgs('claude', tpl, ctx)).toEqual(['-p', 'do it', '--mcp-config', '/w/mcp.json', '--allowedTools', 'mcp__log-parser', '--add-dir', '/w'])
    expect(expandArgs('codex', tpl, ctx)).toEqual(['-p', 'do it', '--add-dir', '/w'])
  })

  it('resolves server placeholders and env references', () => {
    const r = resolveServerConfig(
      { type: 'stdio', command: '{python}', args: ['{mcpServersDir}/x.py'], env: { T: '${env:MY_TOKEN}' } },
      { mcpServersDir: '/m', python: 'python3' },
      { MY_TOKEN: 'abc' }
    )
    expect(r).toEqual({ type: 'stdio', command: 'python3', args: ['/m/x.py'], env: { T: 'abc' } })
  })

  it('formats Claude and Codex stream events', () => {
    expect(formatAgentLine(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } }))).toBe('hi')
    expect(formatAgentLine(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'done' } }))).toBe('done')
    expect(formatAgentLine('plain text')).toBe('plain text')
    expect(formatAgentLine(JSON.stringify({ type: 'unknown' }))).toBeNull()
  })

  it('validates result files', () => {
    const dir = tmp()
    const f = path.join(dir, 'r.json')
    fs.writeFileSync(f, JSON.stringify({ status: 'needs_user', summary: 's', question: 'q?' }))
    expect(readResultFile(f)).toMatchObject({ status: 'needs_user', question: 'q?', artifacts: [] })
    fs.writeFileSync(f, JSON.stringify({ status: 'bogus' }))
    expect(readResultFile(f)).toBeUndefined()
    expect(readResultFile(path.join(dir, 'missing.json'))).toBeUndefined()
  })
})

describe('source mapping', () => {
  it('maps PLM items with the configurable field map', () => {
    const cfg = defaultSettings().sources.plm
    const items = mapPlmItems({ items: [{ id: 'P1', title: 'T', category: 'Big Data', priority: 'Critical' }, { title: 'no id' }] }, cfg)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ externalId: 'P1', plmType: 'BIGDATA', priority: 'critical', source: 'plm' })
    expect(() => mapPlmItems({ nope: 1 }, cfg)).toThrow(/field mapping/)
  })

  it('maps GitHub search results', () => {
    const items = mapGithubItems({ items: [{ number: 12, title: 'Bug', html_url: 'https://github.com/org/app/issues/12', labels: [{ name: 'high' }] }] })
    expect(items[0]).toMatchObject({ externalId: 'org/app#12', priority: 'high', source: 'github' })
  })

  it('reads dot paths', () => {
    expect(getPath({ a: { b: [1, { c: 2 }] } }, 'a.b.1.c')).toBe(2)
  })

  it('upsert keeps the board state of known tasks', () => {
    const store = new JsonStore(tmp())
    const cfg = defaultSettings().sources.plm
    upsertItems(store, mapPlmItems({ items: [{ id: 'P1', title: 'Old' }] }, cfg))
    const t = store.listTasks()[0]
    store.updateTask(t.id, { state: 'review' })
    const r = upsertItems(store, mapPlmItems({ items: [{ id: 'P1', title: 'New' }, { id: 'P2', title: 'Other' }] }, cfg))
    expect(r).toEqual({ added: 1, updated: 1 })
    expect(store.getTask(t.id)).toMatchObject({ title: 'New', state: 'review' })
  })
})

describe('playbooks', () => {
  it('picks a playbook from source and PLM type', () => {
    const base = { id: '1', title: 't', description: '', state: 'todo', priority: 'normal', mode: 'manual', agent: 'default', labels: [] as string[], createdAt: '', updatedAt: '' } as const
    expect(pickPlaybook({ ...base, source: 'plm', plmType: 'CVE' })).toBe('plm-cve')
    expect(pickPlaybook({ ...base, source: 'plm' })).toBe('plm-generic')
    expect(pickPlaybook({ ...base, source: 'github' })).toBe('github-issue')
    expect(pickPlaybook({ ...base, source: 'manual', playbook: 'custom' })).toBe('custom')
  })

  it('renders the bundled PLM playbook with the result contract', () => {
    const task = { id: '1', title: 'Modem crash', description: 'desc', state: 'todo', source: 'plm', plmType: 'SET', externalId: 'P9', priority: 'high', mode: 'manual', agent: 'default', labels: [] as string[], createdAt: '', updatedAt: '' } as const
    const text = buildPrompt(path.resolve('resources/playbooks'), 'plm-set', { task, workspace: '/w', cwd: '/w', resultFile: '/w/.orchestrator/result.json' })
    expect(text).toContain('Modem crash')
    expect(text).toContain('P9')
    expect(text).toContain('/w/.orchestrator/result.json')
    expect(text).not.toMatch(/\{\{/)
  })
})
