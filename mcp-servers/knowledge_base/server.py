"""MCP server: search past resolved PLM cases (keyword BM25 today; vector search TBD)."""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from mcp.server.fastmcp import FastMCP  # noqa: E402

import kb  # noqa: E402

CASES_DIR = Path(os.environ.get("KB_CASES_DIR", Path(__file__).parent / "cases"))
mcp = FastMCP("knowledge-base")


@mcp.tool()
def search_cases(query: str, top_k: int = 5) -> list[dict]:
    """Find resolved cases similar to a crash signature, stack frames, component or symptom."""
    return kb.search(CASES_DIR, query, top_k)


@mcp.tool()
def get_case(case_id: str) -> str:
    """Return the full text of one case returned by search_cases."""
    for c in kb.load_cases(CASES_DIR):
        if c["id"] == case_id:
            return c["text"]
    raise ValueError(f"Unknown case {case_id}")


@mcp.tool()
def add_case(plm_id: str, title: str, signature: str, root_cause: str, fix: str, plm_type: str = "") -> str:
    """Store a resolved case so future searches can find it. Use only after a human confirmed the resolution."""
    return kb.add_case(CASES_DIR, plm_id, title, signature, root_cause, fix, plm_type)


if __name__ == "__main__":
    mcp.run()
