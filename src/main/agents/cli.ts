import fs from 'fs'
import type { AgentId, AgentResult, McpServerConfig } from '@shared/types'

export interface ArgContext {
  prompt: string
  promptFile: string
  workspace: string
  cwd: string
  /** Path to the generated MCP config file, or undefined when no servers are configured. */
  mcpConfig?: string
  mcpServerNames: string[]
}

/** Expands placeholders in an agent's argument template. */
export function expandArgs(agent: AgentId, template: string[], ctx: ArgContext): string[] {
  const out: string[] = []
  for (const arg of template) {
    if (arg === '{mcpConfigArgs}') {
      // Only Claude accepts an MCP config file on the command line. Codex and Gemini read
      // MCP servers from their own config (~/.codex/config.toml, ~/.gemini/settings.json).
      if (agent === 'claude' && ctx.mcpConfig) {
        out.push('--mcp-config', ctx.mcpConfig)
        if (ctx.mcpServerNames.length) {
          out.push('--allowedTools', ...ctx.mcpServerNames.map((n) => `mcp__${n}`))
        }
      }
      continue
    }
    out.push(
      arg
        .replaceAll('{promptFile}', ctx.promptFile)
        .replaceAll('{workspace}', ctx.workspace)
        .replaceAll('{cwd}', ctx.cwd)
        .replaceAll('{mcpConfig}', ctx.mcpConfig ?? '')
        .replaceAll('{prompt}', ctx.prompt)
    )
  }
  return out
}

/** Resolves {python}, {mcpServersDir}, ${env:NAME} inside MCP server definitions. */
export function resolveServerConfig(
  cfg: McpServerConfig,
  vars: { mcpServersDir: string; python: string },
  env: NodeJS.ProcessEnv = process.env
): McpServerConfig {
  const sub = (s: string): string =>
    s
      .replaceAll('{mcpServersDir}', vars.mcpServersDir)
      .replaceAll('{python}', vars.python)
      .replace(/\$\{env:([A-Za-z0-9_]+)\}/g, (_m, name: string) => env[name] ?? '')
  const subRecord = (r?: Record<string, string>): Record<string, string> | undefined =>
    r ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, sub(v)])) : undefined

  if (cfg.type === 'stdio') {
    return { type: 'stdio', command: sub(cfg.command), args: cfg.args?.map(sub), env: subRecord(cfg.env) }
  }
  return { type: 'http', url: sub(cfg.url), headers: subRecord(cfg.headers) }
}

/** Claude Code's --mcp-config file format. */
export function toClaudeMcpJson(servers: Record<string, McpServerConfig>): string {
  const mcpServers: Record<string, unknown> = {}
  for (const [name, s] of Object.entries(servers)) {
    mcpServers[name] =
      s.type === 'stdio'
        ? { type: 'stdio', command: s.command, args: s.args ?? [], env: s.env ?? {} }
        : { type: 'http', url: s.url, headers: s.headers ?? {} }
  }
  return JSON.stringify({ mcpServers }, null, 2)
}

/**
 * Turns one line of an agent's JSON event stream into readable log text.
 * Unknown events are dropped; non-JSON lines pass through unchanged.
 */
export function formatAgentLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  let ev: any
  try {
    ev = JSON.parse(trimmed)
  } catch {
    return trimmed
  }
  if (!ev || typeof ev !== 'object') return trimmed

  // Claude Code stream-json
  if (ev.type === 'assistant' && ev.message?.content) {
    const parts: string[] = []
    for (const c of ev.message.content) {
      if (c.type === 'text' && c.text) parts.push(c.text)
      if (c.type === 'tool_use') parts.push(`→ ${c.name} ${short(JSON.stringify(c.input))}`)
    }
    return parts.join('\n') || null
  }
  if (ev.type === 'user' && Array.isArray(ev.message?.content)) {
    const r = ev.message.content.find((c: any) => c.type === 'tool_result')
    if (!r) return null
    const text = typeof r.content === 'string' ? r.content : JSON.stringify(r.content)
    return `  ← ${r.is_error ? 'error: ' : ''}${short(text)}`
  }
  if (ev.type === 'result') {
    const cost = typeof ev.total_cost_usd === 'number' ? ` · $${ev.total_cost_usd.toFixed(2)}` : ''
    return `■ finished (${ev.subtype ?? 'done'}${cost})`
  }
  if (ev.type === 'system' && ev.subtype === 'init') return `■ session started (${ev.model ?? 'model'})`

  // Codex exec --json
  if (ev.type === 'item.completed' || ev.type === 'item.started') {
    const item = ev.item ?? {}
    if (item.type === 'agent_message' && item.text) return item.text
    if (item.type === 'command_execution' && ev.type === 'item.started') return `→ $ ${item.command}`
    if (item.type === 'mcp_tool_call' && ev.type === 'item.started') return `→ ${item.server}.${item.tool}`
    if (item.type === 'file_change' && ev.type === 'item.completed') return `→ edited files`
    return null
  }
  if (ev.type === 'turn.completed') return '■ turn completed'
  if (ev.type === 'error' || ev.type === 'turn.failed') return `error: ${ev.message ?? ev.error?.message ?? trimmed}`

  // Gemini stream-json
  if (ev.type === 'message' && ev.role === 'assistant' && ev.content) return ev.content
  if (ev.type === 'tool_use') return `→ ${ev.tool_name ?? 'tool'} ${short(JSON.stringify(ev.parameters ?? {}))}`

  return null
}

function short(s: string, n = 200): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

/** Reads and validates the agent's result file. Returns undefined when missing or malformed. */
export function readResultFile(file: string): AgentResult | undefined {
  if (!fs.existsSync(file)) return undefined
  try {
    const r = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!r || !['review', 'needs_user', 'failed'].includes(r.status)) return undefined
    return {
      status: r.status,
      summary: String(r.summary ?? ''),
      question: r.question ? String(r.question) : undefined,
      artifacts: Array.isArray(r.artifacts) ? r.artifacts : []
    }
  } catch {
    return undefined
  }
}
