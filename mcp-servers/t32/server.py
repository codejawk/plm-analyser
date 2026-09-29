"""MCP server: TRACE32 (Lauterbach) remote control via PyRCL, for ramdump analysis.

Requires TRACE32 PowerView (simulator is enough for ramdumps) started with in config.t32:
    RCL=NETTCP
    PORT=20000
TBD: the team's ramdump load script, vmlinux/build location and SoC-specific setup.
"""
from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("t32")

HOST = os.environ.get("T32_HOST", "localhost")
PORT = int(os.environ.get("T32_PORT", "20000"))
# TBD: path to the team's .cmm that loads a ramdump; receives <dump_dir> <vmlinux> as parameters.
RAMDUMP_SCRIPT = os.environ.get("T32_RAMDUMP_SCRIPT", "")

# Analysis is read-only: block commands that change target state or flash.
BLOCKED = re.compile(r"^\s*(FLASH|Data\.Set|D\.S\b|Register\.Set|R\.S\b|SYStem\.Mode\s+Up|Go\b|Step\b)", re.I)

_dbg = None


def dbg():
    global _dbg
    if _dbg is None:
        import lauterbach.trace32.rcl as t32  # imported lazily so the server starts without it

        _dbg = t32.connect(node=HOST, port=PORT, protocol="TCP")
    return _dbg


def capture(command: str, max_chars: int = 20000) -> str:
    """Runs a window command with output redirected to a text file and returns the text."""
    out = Path(tempfile.gettempdir()) / "t32_mcp_capture.txt"
    out.unlink(missing_ok=True)
    d = dbg()
    d.cmd("PRinTer.FileType ASCIIE")
    d.cmd(f'PRinTer.FILE "{out}"')
    d.cmd(f"WinPrint.{command}")
    text = out.read_text(encoding="utf-8", errors="replace") if out.exists() else ""
    return text[:max_chars]


@mcp.tool()
def t32_status() -> dict:
    """Check the connection to TRACE32 PowerView and report the software version and CPU."""
    d = dbg()
    return {"host": HOST, "port": PORT, "version": str(d.fnc("VERSION.SOFTWARE()")), "cpu": str(d.fnc("CPU()"))}


@mcp.tool()
def load_ramdump(dump_dir: str, vmlinux: str = "") -> str:
    """Load a ramdump into the simulator using the team's load script. TBD until T32_RAMDUMP_SCRIPT is configured."""
    if not RAMDUMP_SCRIPT:
        return ("TBD: ramdump loading is not configured. Set T32_RAMDUMP_SCRIPT to the team's load .cmm "
                "(and share how vmlinux is located for a build). Ask the user to load the dump manually meanwhile.")
    dbg().cmd(f'DO "{RAMDUMP_SCRIPT}" "{dump_dir}" "{vmlinux}"')
    return capture("AREA.view", 8000) or "Load script finished."


@mcp.tool()
def t32_backtrace() -> str:
    """Call stack with locals for the current context."""
    return capture("Frame.view /Locals /Caller")


@mcp.tool()
def t32_task_list() -> str:
    """Linux task list (needs Linux awareness loaded by the ramdump script)."""
    return capture("TASK.DTask")


@mcp.tool()
def t32_eval(expression: str) -> str:
    """Evaluate a PRACTICE function, e.g. Var.VALUE(jiffies) or Register(PC)."""
    return str(dbg().fnc(expression))


@mcp.tool()
def t32_view(command: str) -> str:
    """Run a read-only view command and return its text, e.g. 'Var.View %Hex my_struct' or 'Data.dump 0x1000++0x40'."""
    if BLOCKED.match(command):
        raise ValueError("That command changes target state and is blocked for analysis.")
    return capture(command)


if __name__ == "__main__":
    mcp.run()
