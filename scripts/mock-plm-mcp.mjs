// Stand-in PLM MCP server for trying the app before the real PLM MCP address is available.
// Settings → PLM source → MCP server: {"type":"stdio","command":"node","args":["<path>/scripts/mock-plm-mcp.mjs"]}
// Tool: "list_my_plms", items path: "items". Matches the default field mapping.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const items = [
  { id: 'P260918-0412', title: 'Modem crash on boot after OTA', description: 'Device reboots twice after OTA to build XYZ. RDX logs attached.', category: 'Set issue', url: 'https://plm.example/P260918-0412', priority: 'High' },
  { id: 'P260921-1180', title: 'Wi-Fi disconnects after screen off', description: 'Customer reports Wi-Fi drops ~5 min after screen off. dumpstate attached.', category: 'GVOC', url: 'https://plm.example/P260921-1180', priority: 'Normal' },
  { id: 'P260922-0033', title: 'CVE-2026-1123 binder use-after-free', description: 'Apply security patch for CVE-2026-1123 to our kernel branch.', category: 'CVE', url: 'https://plm.example/P260922-0033', priority: 'Critical' },
  { id: 'P260923-0907', title: 'ANR spike in Settings (big data)', description: '1,240 occurrences across 3 builds. Samples attached.', category: 'Big Data', url: 'https://plm.example/P260923-0907', priority: 'Normal' }
]

const server = new McpServer({ name: 'mock-plm', version: '0.0.1' })
server.registerTool('list_my_plms', { description: 'List PLMs assigned to me (mock data).' }, async () => ({
  content: [{ type: 'text', text: JSON.stringify({ items }) }]
}))
await server.connect(new StdioServerTransport())
