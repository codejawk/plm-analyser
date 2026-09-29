"""MCP server: log parsing tools for PLM analysis (dumpstate ready, RDX TBD)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from mcp.server.fastmcp import FastMCP  # noqa: E402

import dumpstate  # noqa: E402

mcp = FastMCP("log-parser")


@mcp.tool()
def dumpstate_overview(path: str) -> dict:
    """Summarize a dumpstate/bugreport (.txt or .zip): build info, crash counts and the list of sections."""
    return dumpstate.overview(path)


@mcp.tool()
def dumpstate_section(path: str, name: str, offset: int = 0, max_lines: int = 400) -> dict:
    """Return lines of one dumpstate section (case-insensitive substring match, e.g. 'SYSTEM LOG', 'KERNEL LOG')."""
    return dumpstate.section_text(path, name, offset, max_lines)


@mcp.tool()
def find_crashes(path: str, context: int = 12, limit: int = 40) -> list[dict]:
    """Find Java crashes, ANRs, native crashes, kernel panics, watchdog and restarts with surrounding lines."""
    return dumpstate.find_crashes(dumpstate.read_lines(path), context, limit)


@mcp.tool()
def grep_log(path: str, pattern: str, context: int = 2, max_matches: int = 50) -> list[dict]:
    """Case-insensitive regex search in any text log (or bugreport zip) with context lines."""
    return dumpstate.grep(path, pattern, context, max_matches)


@mcp.tool()
def parse_rdx(path: str) -> dict:
    """Parse RDX (ramdump extractor) output. TBD: format not known yet; returns a file listing and previews."""
    p = Path(path)
    files = [p] if p.is_file() else sorted(x for x in p.rglob("*") if x.is_file())[:200]
    previews = []
    for f in files[:20]:
        try:
            head = f.read_text(encoding="utf-8", errors="replace").splitlines()[:15]
        except OSError:
            head = []
        previews.append({"file": str(f), "size": f.stat().st_size, "head": "\n".join(head)})
    return {
        "status": "TBD",
        "note": "RDX parsing is not implemented yet. Use grep_log / find_crashes on these files meanwhile.",
        "files": previews,
    }


if __name__ == "__main__":
    mcp.run()
