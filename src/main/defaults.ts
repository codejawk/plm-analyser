import os from 'os'
import path from 'path'
import type { Settings } from '@shared/types'

/**
 * Default settings for a fresh install. Everything here can be edited from the Settings screen.
 * Values marked TBD are placeholders until the PLM MCP details are shared.
 */
export function defaultSettings(): Settings {
  return {
    defaultAgent: 'claude',
    defaultRunStyle: 'interactive',
    workspaces: {
      plmRoot: path.join(os.homedir(), 'PLM'),
      githubRoot: path.join(os.homedir(), 'github'),
      githubRepos: {},
      manualRoot: path.join(os.homedir(), 'Tasks')
    },
    autoMode: false,
    maxConcurrentRuns: 2,
    syncIntervalMinutes: 15,
    agents: {
      claude: {
        command: 'claude',
        args: [
          '-p',
          '{prompt}',
          '--output-format',
          'stream-json',
          '--verbose',
          '--permission-mode',
          'acceptEdits',
          '--add-dir',
          '{workspace}',
          '{mcpConfigArgs}'
        ],
        interactiveArgs: ['{prompt}', '--add-dir', '{workspace}', '{mcpConfigArgs}']
      },
      codex: {
        command: 'codex',
        args: [
          'exec',
          '--json',
          '--skip-git-repo-check',
          '--sandbox',
          'workspace-write',
          '-C',
          '{cwd}',
          '--add-dir',
          '{workspace}',
          '{prompt}'
        ],
        interactiveArgs: ['-C', '{cwd}', '--add-dir', '{workspace}', '{prompt}']
      },
      gemini: {
        command: 'gemini',
        args: [
          '-p',
          '{prompt}',
          '--output-format',
          'stream-json',
          '--approval-mode',
          'auto_edit',
          '--include-directories',
          '{workspace}'
        ],
        interactiveArgs: ['-i', '{prompt}', '--include-directories', '{workspace}']
      }
    },
    // Tool servers the agent may use while resolving a task. Paths are relative to the
    // bundled mcp-servers folder via the {mcpServersDir} placeholder.
    agentMcpServers: {
      'log-parser': {
        type: 'stdio',
        command: '{python}',
        args: ['{mcpServersDir}/log_parser/server.py']
      }
      // 'knowledge-base': { type: 'stdio', command: '{python}', args: ['{mcpServersDir}/knowledge_base/server.py'] },
      // 't32':            { type: 'stdio', command: '{python}', args: ['{mcpServersDir}/t32/server.py'] },
      // 'p4':             { type: 'stdio', command: '{python}', args: ['{mcpServersDir}/p4/server.py'] },
      // 'codegrok':       TBD
      // 'plm':            TBD (same server as the PLM source)
    },
    sources: {
      github: {
        enabled: false,
        server: {
          type: 'stdio',
          command: 'github-mcp-server',
          args: ['stdio', '--read-only', '--toolsets', 'issues,pull_requests'],
          env: { GITHUB_PERSONAL_ACCESS_TOKEN: '${env:GITHUB_TOKEN}' }
        },
        tool: 'search_issues',
        queries: ['is:open assignee:@me']
      },
      plm: {
        enabled: false,
        // TBD: replace with the PLM MCP server address once shared.
        server: { type: 'http', url: 'TBD', headers: {} },
        tool: 'TBD_list_my_plms',
        toolArgs: {},
        itemsPath: 'items',
        fields: {
          id: 'id',
          title: 'title',
          description: 'description',
          type: 'category',
          url: 'url',
          priority: 'priority'
        },
        typeMap: {
          CVE: 'CVE',
          GVOC: 'GVOC',
          'Big Data': 'BIGDATA',
          BIGDATA: 'BIGDATA',
          'Set issue': 'SET',
          SET: 'SET'
        }
      }
    }
  }
}

/** Fill in any keys missing from an older settings file. */
export function mergeSettings(saved: Partial<Settings> | undefined): Settings {
  const d = defaultSettings()
  if (!saved) return d
  return {
    ...d,
    ...saved,
    workspaces: { ...d.workspaces, ...(saved.workspaces ?? {}) },
    agents: Object.fromEntries(
      (Object.keys(d.agents) as (keyof Settings['agents'])[]).map((k) => [k, { ...d.agents[k], ...(saved.agents?.[k] ?? {}) }])
    ) as Settings['agents'],
    agentMcpServers: saved.agentMcpServers ?? d.agentMcpServers,
    sources: {
      github: { ...d.sources.github, ...(saved.sources?.github ?? {}) },
      plm: {
        ...d.sources.plm,
        ...(saved.sources?.plm ?? {}),
        fields: { ...d.sources.plm.fields, ...(saved.sources?.plm?.fields ?? {}) }
      }
    }
  }
}
