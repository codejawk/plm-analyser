"""Keyword (BM25) search over a folder of resolved cases. Vector search is TBD."""
from __future__ import annotations

import json
import math
import re
from collections import Counter
from datetime import date
from pathlib import Path

TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_.:]*|0x[0-9a-fA-F]+|\d+")


def tokenize(text: str) -> list[str]:
    return [t.lower() for t in TOKEN_RE.findall(text)]


def load_cases(folder: Path) -> list[dict]:
    cases = []
    for f in sorted(folder.glob("*")):
        if f.suffix == ".json":
            data = json.loads(f.read_text(encoding="utf-8"))
            text = "\n".join(str(v) for v in data.values())
            cases.append({"id": f.stem, "title": data.get("title", f.stem), "text": text, "file": str(f)})
        elif f.suffix == ".md":
            text = f.read_text(encoding="utf-8")
            title = next((l.lstrip("# ").strip() for l in text.splitlines() if l.strip()), f.stem)
            cases.append({"id": f.stem, "title": title, "text": text, "file": str(f)})
    return cases


def search(folder: Path, query: str, top_k: int = 5, k1: float = 1.5, b: float = 0.75) -> list[dict]:
    cases = load_cases(folder)
    if not cases:
        return []
    docs = [tokenize(c["text"]) for c in cases]
    avg = sum(len(d) for d in docs) / len(docs)
    df: Counter[str] = Counter()
    for d in docs:
        df.update(set(d))
    q = tokenize(query)
    scored = []
    for case, d in zip(cases, docs):
        tf = Counter(d)
        score = 0.0
        for term in q:
            if term not in tf:
                continue
            idf = math.log(1 + (len(docs) - df[term] + 0.5) / (df[term] + 0.5))
            score += idf * tf[term] * (k1 + 1) / (tf[term] + k1 * (1 - b + b * len(d) / avg))
        if score > 0:
            snippet = case["text"][:600]
            scored.append({"id": case["id"], "title": case["title"], "score": round(score, 2), "file": case["file"], "snippet": snippet})
    return sorted(scored, key=lambda x: -x["score"])[:top_k]


def add_case(folder: Path, plm_id: str, title: str, signature: str, root_cause: str, fix: str, plm_type: str = "") -> str:
    folder.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", plm_id or title)[:80]
    path = folder / f"{safe}.md"
    path.write_text(
        f"# {title}\n\n- PLM: {plm_id}\n- Type: {plm_type}\n- Added: {date.today()}\n\n"
        f"## Signature\n{signature}\n\n## Root cause\n{root_cause}\n\n## Fix\n{fix}\n",
        encoding="utf-8",
    )
    return str(path)
