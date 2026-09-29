import type { AppInfo, Settings } from '@shared/types'

interface ToolStatus {
  name: string
  purpose: string
  status: 'ready' | 'partial' | 'tbd'
  note: string
}

const TOOLS: ToolStatus[] = [
  {
    name: 'log-parser',
    purpose: 'Splits dumpstate into sections and finds crashes, ANRs, tombstones and kernel panics.',
    status: 'ready',
    note: 'Dumpstate parsing works. RDX output parsing is TBD (needs a sample).'
  },
  {
    name: 'knowledge-base',
    purpose: 'Searches past resolved PLMs for similar issues (RAG).',
    status: 'partial',
    note: 'Keyword search over a folder of case files works. Vector search and PLM history export are TBD.'
  },
  {
    name: 't32',
    purpose: 'Loads a ramdump into the TRACE32 simulator and reads backtraces, tasks and variables.',
    status: 'partial',
    note: 'Generic PyRCL tools work. The ramdump load script, vmlinux lookup and build location are TBD.'
  },
  {
    name: 'p4',
    purpose: 'Read-only Perforce queries plus shelving a changelist (never submits).',
    status: 'partial',
    note: 'Uses the p4 CLI. Client/stream naming and SCL conventions are TBD.'
  },
  {
    name: 'codegrok',
    purpose: 'Code search across the Samsung codebase.',
    status: 'tbd',
    note: 'API details TBD.'
  },
  {
    name: 'plm',
    purpose: 'Reads PLM details, attachments and logs; posts comments.',
    status: 'tbd',
    note: 'Existing PLM MCP server; address TBD.'
  }
]

const STATUS_PILL = { ready: ['ok', 'Ready'], partial: ['warn', 'Partial'], tbd: ['neutral', 'TBD'] } as const

export function ToolsView({ settings, info }: { settings: Settings; info: AppInfo }): React.JSX.Element {
  const enabled = new Set(Object.keys(settings.agentMcpServers))
  return (
    <div className="page">
      <h2>Tools &amp; knowledge</h2>
      <div className="muted">
        These MCP servers are what the agent uses to resolve PLMs. Enable one by adding it under Settings → Tool servers
        for agents. Sources live in <span className="mono">{info.mcpServersDir}</span>.
      </div>
      <section className="panel">
        {TOOLS.map((t) => {
          const [cls, label] = STATUS_PILL[t.status]
          return (
            <div key={t.name} style={{ display: 'grid', gap: 4, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
              <div className="row">
                <strong className="mono">{t.name}</strong>
                <span className={`pill ${cls}`}>{label}</span>
                {enabled.has(t.name) ? (
                  <span className="pill run">Enabled for agents</span>
                ) : (
                  <span className="muted">not enabled</span>
                )}
              </div>
              <div>{t.purpose}</div>
              <div className="muted">{t.note}</div>
            </div>
          )
        })}
      </section>
      <section className="panel">
        <div className="panel-head">
          <h3>PLM resolution flow</h3>
        </div>
        <ol style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
          <li>Fetch PLM details and logs <span className="tbd">TBD</span></li>
          <li>Parse dumpstate / RDX output (log-parser)</li>
          <li>Search similar past cases (knowledge-base)</li>
          <li>If memory inspection is needed, load the ramdump in T32 <span className="tbd">TBD</span></li>
          <li>Search code with CodeGrok / P4 <span className="tbd">TBD</span></li>
          <li>Fix found → shelve an SCL → Review. Vendor issue → ask you to raise a Qualcomm case.</li>
        </ol>
        <div className="muted">The steps for each PLM type live in the playbooks folder and can be edited without rebuilding.</div>
      </section>
    </div>
  )
}
