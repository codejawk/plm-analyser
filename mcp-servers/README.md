# Agent tool servers (MCP)

Python MCP servers the agents use while resolving tasks. Enable one by adding it under
**Settings → Tool servers for agents** (a `log-parser` entry is there by default).

```
pip install -r requirements.txt
```

| Server | Status | Notes |
|---|---|---|
| `log_parser` | Ready | Dumpstate/bugreport (.txt or .zip). `parse_rdx` is **TBD** until the RDX format is shared. |
| `knowledge_base` | Partial | BM25 keyword search over `cases/*.md|*.json` (or `KB_CASES_DIR`). Vector search and PLM history export are **TBD**. |
| `t32` | Partial | PyRCL-based; needs PowerView with `RCL=NETTCP`, `PORT=20000`. Ramdump load script (`T32_RAMDUMP_SCRIPT`) and vmlinux lookup are **TBD**. |
| `p4` | Partial | Read-only queries + create/shelve changelist. No submit tool on purpose. Conventions **TBD**. |
| `codegrok` | TBD | API details needed. |
| `plm` | TBD | Use the existing PLM MCP server once the address is shared. |
