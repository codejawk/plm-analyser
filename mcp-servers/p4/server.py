"""MCP server: Perforce helpers. Read-only queries plus shelving — submitting is deliberately impossible.

Uses the p4 CLI with the user's existing P4PORT / P4USER / P4CLIENT environment.
TBD: team client/stream naming, SCL description template, reviewer conventions.
"""
from __future__ import annotations

import subprocess

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("p4")


def p4(*args: str, stdin: str | None = None) -> str:
    r = subprocess.run(["p4", *args], input=stdin, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() or r.stdout.strip())
    return r.stdout[:40000]


@mcp.tool()
def p4_info() -> str:
    """Current Perforce user, client and server."""
    return p4("info")


@mcp.tool()
def p4_changes(path: str, max_results: int = 20) -> str:
    """Recent submitted changelists touching a depot path, e.g. //depot/main/kernel/..."""
    return p4("changes", "-l", "-m", str(max_results), path)


@mcp.tool()
def p4_describe(change: int, with_diff: bool = False) -> str:
    """Describe a changelist; optionally include the diff."""
    return p4("describe", "-du" if with_diff else "-s", str(change))


@mcp.tool()
def p4_print(depot_file: str) -> str:
    """Print the contents of a depot file (optionally with #rev)."""
    return p4("print", "-q", depot_file)


@mcp.tool()
def p4_opened() -> str:
    """Files opened in the current client."""
    return p4("opened")


@mcp.tool()
def p4_create_changelist(description: str) -> str:
    """Create a new pending changelist and move the default changelist's open files into it."""
    spec = p4("change", "-o")
    lines, out, skip = spec.splitlines(), [], False
    for line in lines:
        if line.startswith("Description:"):
            out.append("Description:")
            out.extend("\t" + d for d in description.splitlines())
            skip = True
            continue
        if skip and line.startswith("\t"):
            continue
        skip = False
        out.append(line)
    return p4("change", "-i", stdin="\n".join(out) + "\n")


@mcp.tool()
def p4_shelve(change: int) -> str:
    """Shelve the files of a pending changelist so a human can review. Never submits."""
    return p4("shelve", "-f", "-c", str(change))


if __name__ == "__main__":
    mcp.run()
