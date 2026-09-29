# Task Orchestrator

Desktop app (Windows / macOS) that collects tasks from **PLM**, **GitHub** and **manual entry** into one board:
**To do → Running → Review → Completed**. Any task can be handed to an AI agent — **Claude CLI**, **Codex CLI** or
**Gemini CLI** — which works on it and moves it to Review, or asks you for help.

Items marked **TBD** are waiting for PLM-side details (PLM MCP address, RDX format, T32 load script, build/vmlinux
location, CodeGrok API, SCL conventions). They are configuration, not code changes, wherever possible.

## Install (team members)

1. Install at least one agent CLI and sign in: `claude`, `codex` or `gemini`.
2. Install Python 3.10+ and the tool servers' packages:
   ```
   pip install -r mcp-servers/requirements.txt
   ```
3. Run the installer `Task Orchestrator Setup x.y.z.exe` (build it with `npm run dist:win`, see below).

Each person's data is local: `%APPDATA%\Task Orchestrator\data` on Windows (`db.json`, run logs, task workspaces,
editable playbooks). Set `ORCH_DATA_DIR` to use another folder.

## How it works

| You do | What happens |
|---|---|
| **+ New task** | Manual task (general or PLM entered by hand). |
| **Sync now** / timer | GitHub and PLM tasks are pulled via MCP. New items land in To do; existing ones only get their text refreshed. |
| Drag a card to **Running** or press **Run agent** | The task's agent starts in the task's **work folder** (see below). |
| Click a card whose agent is working | Opens its **terminal tab**: the real Claude / Codex / Gemini CLI. Type answers and approvals there. Cards show *Waiting for your input* when the CLI seems to be asking. |
| Drag a card out of Running / **Stop agent** | The agent is stopped. |
| Agent finishes with `review` | Card moves to **Review** with summary and artifacts (SCL, PR, patch, report). |
| Agent finishes with `needs_user` | Card stays in Running, flagged **Needs you** (e.g. raise a Qualcomm case). Reply in the panel to resume. |
| Agent fails | Card goes back to To do with the error; its mode switches to manual so auto mode will not retry it forever. |
| **Auto mode** on | Every 5 s, To-do tasks with mode *auto* start by priority, up to the concurrency limit. |

Any card can always be dragged to any column by hand.

### Work folders
Set per task (**Browse…** in the task panel or New task dialog), otherwise derived from Settings → Work folders:

| Source | Folder |
|---|---|
| PLM | `<PLM root>/<PLM id>` — logs, analysis and `REPORT.md` go here |
| GitHub | the mapped clone for `owner/repo`, else `<GitHub root>/<repo>` (the agent clones into it if empty) |
| Manual | `<Manual root>/<task title>` |

### Terminal vs background runs
- **Terminal** (default): the CLI runs interactively in a pseudo-terminal; you can answer permission prompts and questions.
  When the agent writes its result file the card moves and the session closes. A `needs_user` result flags the card but
  keeps the session open so you can answer directly.
- **Background**: headless (`claude -p`, `codex exec`, `gemini -p`). No one can approve prompts, so tools that need
  approval are refused — adjust the background arguments (e.g. `--allowedTools`) if you use this for auto mode.

### Agent contract
Each run gets a workspace `data/workspaces/<task-id>/` containing `.orchestrator/PROMPT.md` (the rendered playbook),
`task.json`, and `mcp.json` (tool servers, passed to Claude via `--mcp-config`). The agent must write
`.orchestrator/result.json`:

```json
{ "status": "review | needs_user | failed", "summary": "...", "question": "...",
  "artifacts": [{ "type": "scl | pr | patch | report | other", "ref": "...", "note": "..." }] }
```

Agents never submit SCLs or merge PRs — they shelve / open drafts only (enforced in playbooks, and the `p4` tool server
has no submit tool).

### Playbooks
`resources/playbooks/*.md` are copied to the user's data folder on first run and can be edited there:
`generic`, `github-issue`, `plm-cve`, `plm-gvoc`, `plm-bigdata`, `plm-set`, `plm-generic`, plus `_result-contract.md`.
The playbook is chosen from the task's source and PLM type, or set per task.

### Tool servers (MCP) — see [mcp-servers/README.md](mcp-servers/README.md)
`log_parser` (dumpstate ready, RDX TBD) · `knowledge_base` (keyword search ready, vector TBD) · `t32` (PyRCL, ramdump
script TBD) · `p4` (read + shelve) · `codegrok` TBD · `plm` TBD.

## Configuring sources

**GitHub** — Settings → GitHub source. Uses the official
[github-mcp-server](https://github.com/github/github-mcp-server) binary on PATH; set `GITHUB_TOKEN` in your environment
(`GITHUB_HOST` in the server env for GitHub Enterprise). Queries use GitHub search syntax, e.g.
`repo:org/app is:open assignee:@me`.

**PLM (TBD)** — Settings → PLM source: server (stdio command or HTTP URL), the tool that lists my PLMs, its arguments,
where the list is in the result (`itemsPath`), field mapping and category → type map. To try the flow now, point it at
the mock server:

```json
{ "type": "stdio", "command": "node", "args": ["<repo>/scripts/mock-plm-mcp.mjs"] }
```
with tool `list_my_plms` and items path `items`.

## Develop

```
npm install
npm run dev          # app with hot reload
npm test             # unit + integration tests (fake agent CLI, mock PLM MCP)
npm run typecheck
npm run dist:win     # Windows NSIS installer in dist/ (build on Windows, or macOS/Linux with Wine)
npm run dist:mac
```

Python tool server tests: `cd mcp-servers/log_parser && python -m unittest`.

### Layout
```
src/main/            Electron main process
  orchestrator.ts    state transitions, agent processes, auto-mode scheduler
  store.ts           Store interface + local JSON implementation (swap for a server later)
  agents/cli.ts      CLI argument templates, MCP config, stream-log formatting, result parsing
  sources/           MCP client, GitHub/PLM mapping, sync
  playbooks.ts       playbook selection and prompt rendering
src/preload/         typed bridge (window.api)
src/renderer/        React UI: board, task panel, settings, tools
src/shared/types.ts  types shared by all layers
resources/playbooks/ default playbooks
mcp-servers/         Python MCP tool servers for agents
scripts/             mock PLM MCP server
tests/               vitest tests
```

## Roadmap / TBD
- PLM MCP: address, list tool, field mapping, attachment download → fill in Settings; add as agent tool server.
- RDX output parser (needs sample + format).
- T32: team ramdump load `.cmm`, vmlinux/build lookup by build ID, license count for parallel simulators.
- CodeGrok MCP; P4 client/stream conventions and SCL description template.
- Knowledge base: export historical resolved PLMs; add vector search next to keyword search; auto-add on Completed.
- Shared team server (implement `Store` against a backend) and shared board.
