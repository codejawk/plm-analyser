# PLM · GVOC

**{{task.title}}**

{{task.description}}

## Inputs
- PLM: {{task.externalId}} ({{task.plmType}}) {{task.externalUrl}}
- Priority: {{task.priority}}
- PLM folder (logs, analysis, report): `{{cwd}}`
- Code checkouts are separate; change code only in the checkout for the affected branch (**TBD: branch → checkout mapping**).

## Tools you may have (check which MCP tools are available)
- `plm` — PLM details, attachments, comments. **TBD: server not connected yet.** If unavailable, use the description above and any files already in `{{cwd}}`; if logs are missing, return `needs_user` asking for the log location.
- `log-parser` — `dumpstate_overview`, `dumpstate_section`, `find_crashes`, `grep_log`, `parse_rdx` (RDX: TBD).
- `knowledge-base` — `search_cases` for similar resolved PLMs.
- `t32` — ramdump analysis in TRACE32. **TBD: load script / vmlinux location not configured.** Only use when RDX/dumpstate is not enough.
- `p4` / `codegrok` — code search and shelving. **TBD.**

## Shared steps
1. **Collect** — fetch the PLM details and all logs into `{{cwd}}/logs`. Note the build fingerprint / version.
2. **Parse** — get an overview of the logs and extract the failure signature (exception/panic text, top frames, process, timestamps).
3. **Match history** — search the knowledge base with the signature and key frames. Note matches and their fixes.
4. **Deepen if needed** — only if the logs and history are not enough, and a ramdump exists, use T32 (backtrace, task list, specific variables).
5. **Locate code** — find the responsible code and any existing fix on other branches.
6. **Decide**
   - Fix is in our code and you are confident → apply it in the checkout, **shelve** an SCL with a clear description (PLM ID, root cause, fix) and return `review` with the SCL number. **TBD: SCL description template.**
   - Root cause is in Qualcomm / vendor code → do not patch. Return `needs_user` asking the human to raise a Qualcomm case; include a ready-to-paste case summary in `{{cwd}}/QUALCOMM_CASE.md`.
   - Not enough evidence → write the analysis and return `review` with the report, or `needs_user` naming the exact missing data.
7. **Report** — always write `{{cwd}}/REPORT.md`: signature, evidence (file + line in logs), root cause, confidence, fix or next step.

## Specific to GVOC
- GVOC issues come with **dumpstate** logs. Start with `dumpstate_overview` and `find_crashes`.
- The customer's description is often vague: match the time of the complaint to log events (crashes, ANRs, reboots, network drops).
- If there is no clear failure in the logs, return `review` with a report of what was checked and what extra logs would help.
- **TBD:** GVOC-specific triage rules from the team.
