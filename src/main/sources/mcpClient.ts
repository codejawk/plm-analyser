import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpServerConfig } from '@shared/types'

/** Opens an MCP connection, runs `fn`, and always closes the connection. */
export async function withMcpClient<T>(cfg: McpServerConfig, fn: (client: Client) => Promise<T>): Promise<T> {
  if (cfg.type === 'http' && (!cfg.url || cfg.url === 'TBD')) {
    throw new Error('MCP server URL is not configured yet (TBD).')
  }
  const transport =
    cfg.type === 'stdio'
      ? new StdioClientTransport({
          command: cfg.command,
          args: cfg.args ?? [],
          env: { ...(process.env as Record<string, string>), ...(cfg.env ?? {}) },
          stderr: 'pipe'
        })
      : new StreamableHTTPClientTransport(new URL(cfg.url), {
          requestInit: { headers: cfg.headers ?? {} }
        })

  const client = new Client({ name: 'task-orchestrator', version: '0.1.0' })
  await client.connect(transport)
  try {
    return await fn(client)
  } finally {
    await client.close().catch(() => undefined)
  }
}

/**
 * Calls a tool and returns its result as parsed JSON when possible.
 * MCP tools return content blocks; most list-style tools put JSON in the first text block.
 */
export async function callToolJson(client: Client, name: string, args: Record<string, unknown>): Promise<unknown> {
  const res = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean
    structuredContent?: unknown
    content?: Array<{ type: string; text?: string }>
  }
  const text = (res.content ?? [])
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text)
    .join('\n')
  if (res.isError) throw new Error(`Tool ${name} returned an error: ${text.slice(0, 500)}`)
  if (res.structuredContent !== undefined) return res.structuredContent
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
