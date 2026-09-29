"""Pure helpers for Android dumpstate / bugreport files. No MCP dependency, so they are easy to test."""
from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

SECTION_RE = re.compile(r"^------ (?!\d[\d.]*s was the duration)(.+?) ------\s*$")
HEADER_KEYS = ("Build:", "Build fingerprint:", "Bootloader:", "Radio:", "Kernel:", "Uptime:", "dumpstate:")

CRASH_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("java_crash", re.compile(r"FATAL EXCEPTION")),
    ("anr", re.compile(r"\bANR in\b")),
    ("native_crash", re.compile(r"^\*\*\* \*\*\* \*\*\* \*\*\* \*\*\* \*\*\*")),
    ("native_crash", re.compile(r"Fatal signal \d+")),
    ("kernel_panic", re.compile(r"Kernel panic|Internal error: Oops|BUG: ")),
    ("watchdog", re.compile(r"WATCHDOG KILLING SYSTEM PROCESS|Blocked in handler")),
    ("system_restart", re.compile(r"system_server.*(died|restart)|Zygote.*died", re.I)),
    ("lowmemory", re.compile(r"lowmemorykiller|Out of memory: Kill", re.I)),
]


@dataclass
class Section:
    name: str
    start: int  # 0-based line index of the header
    end: int  # exclusive


def read_lines(path: str) -> list[str]:
    """Reads a text log, or the main bugreport/dumpstate text inside a .zip."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(path)
    if p.suffix.lower() == ".zip":
        with zipfile.ZipFile(p) as z:
            txts = [i for i in z.infolist() if i.filename.lower().endswith(".txt")]
            if not txts:
                raise ValueError("No .txt file inside the zip")
            preferred = [i for i in txts if re.search(r"(bugreport|dumpstate)", i.filename, re.I)]
            main = max(preferred or txts, key=lambda i: i.file_size)
            data = z.read(main.filename)
        return io.TextIOWrapper(io.BytesIO(data), encoding="utf-8", errors="replace").read().splitlines()
    return p.read_text(encoding="utf-8", errors="replace").splitlines()


def split_sections(lines: list[str]) -> list[Section]:
    sections: list[Section] = []
    for i, line in enumerate(lines):
        m = SECTION_RE.match(line)
        if m:
            if sections:
                sections[-1].end = i
            sections.append(Section(m.group(1).strip(), i, len(lines)))
    return sections


def header_info(lines: list[str], limit: int = 60) -> dict[str, str]:
    info: dict[str, str] = {}
    for line in lines[:limit]:
        for key in HEADER_KEYS:
            if line.startswith(key):
                info[key.rstrip(":")] = line[len(key):].strip()
    return info


def find_crashes(lines: list[str], context: int = 12, limit: int = 40) -> list[dict]:
    hits: list[dict] = []
    for i, line in enumerate(lines):
        for kind, pat in CRASH_PATTERNS:
            if pat.search(line):
                hits.append({
                    "kind": kind,
                    "line": i + 1,
                    "text": line.strip()[:300],
                    "context": "\n".join(lines[i : i + context]),
                })
                break
        if len(hits) >= limit:
            break
    return hits


def overview(path: str) -> dict:
    lines = read_lines(path)
    sections = split_sections(lines)
    crashes = find_crashes(lines, context=0, limit=500)
    counts: dict[str, int] = {}
    for c in crashes:
        counts[c["kind"]] = counts.get(c["kind"], 0) + 1
    return {
        "file": path,
        "lines": len(lines),
        "header": header_info(lines),
        "crash_counts": counts,
        "sections": [{"name": s.name, "start_line": s.start + 1, "lines": s.end - s.start} for s in sections],
    }


def section_text(path: str, name: str, offset: int = 0, max_lines: int = 400) -> dict:
    lines = read_lines(path)
    wanted = name.lower()
    for s in split_sections(lines):
        if wanted in s.name.lower():
            body = lines[s.start : s.end]
            chunk = body[offset : offset + max_lines]
            return {
                "section": s.name,
                "total_lines": len(body),
                "offset": offset,
                "text": "\n".join(chunk),
                "more": offset + max_lines < len(body),
            }
    raise ValueError(f"No section matching {name!r}")


def grep(path: str, pattern: str, context: int = 2, max_matches: int = 50) -> list[dict]:
    lines = read_lines(path)
    rx = re.compile(pattern, re.I)
    out: list[dict] = []
    for i, line in enumerate(lines):
        if rx.search(line):
            lo, hi = max(0, i - context), min(len(lines), i + context + 1)
            out.append({"line": i + 1, "text": "\n".join(lines[lo:hi])})
            if len(out) >= max_matches:
                break
    return out
