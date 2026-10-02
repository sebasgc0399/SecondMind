#!/usr/bin/env python3
"""Reindex de Spec/gotchas/*.md a corpus.json.

Lee desde cwd (asume invocacion desde la raiz del repo SecondMind o subdirectorio),
parsea cada archivo de dominio extrayendo gotchas individuales (un "## titulo" por gotcha),
emite corpus.json atomico con sort_keys + ensure_ascii=False para diffs estables.

Invocacion automatica via PostToolUse hook tras Edit/Write a Spec/gotchas/*.md.
Manual: `cd <repo-root> && python .claude/skills/gotchas-search/reindex.py`.
"""
from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

CORPUS_PATH = Path(__file__).parent / "corpus.json"
LINK_PATTERN = re.compile(r"\[(?:[^\]]*?)\]\((\.\./\.\./[^)\s]+)\)")


def find_gotchas_dir() -> Path | None:
    """Localizar Spec/gotchas/ subiendo desde cwd. None si no encuentra."""
    cwd = Path.cwd().resolve()
    for parent in [cwd, *cwd.parents]:
        candidate = parent / "Spec" / "gotchas"
        if candidate.is_dir():
            return candidate
    return None


def slugify(title: str) -> str:
    """GitHub markdown anchor convention. Mantiene letras Unicode (acentos, ñ)."""
    s = title.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s, flags=re.UNICODE)
    s = re.sub(r"\s+", "-", s)
    return s


def parse_file(path: Path) -> list[dict[str, Any]]:
    """Parse un archivo de dominio. Devuelve lista de entries (uno por gotcha)."""
    domain = path.stem
    content = path.read_text(encoding="utf-8")
    # Split por h2 headers. El primer chunk es el header del archivo (h1 + blockquote intro), descartar.
    chunks = re.split(r"\n## ", content)
    entries: list[dict[str, Any]] = []
    for chunk in chunks[1:]:
        # First line is the title (sin "## " prefix), rest is body.
        lines = chunk.split("\n", 1)
        if len(lines) < 2:
            title, body = lines[0], ""
        else:
            title, body = lines[0].strip(), lines[1].strip()
        if not title:
            continue
        slug = slugify(title)
        paths = LINK_PATTERN.findall(body)
        # Strip leading `../../` for canonical paths.
        clean_paths = sorted({p[6:] for p in paths if p.startswith("../../")})
        entries.append({
            "id": f"{domain}::{slug}",
            "dominio": domain,
            "titulo": title,
            "slug": slug,
            "body": body,
            "paths_referenciados": clean_paths,
            "archivo_canonico": f"Spec/gotchas/{path.name}",
            "anchor_url": f"Spec/gotchas/{path.name}#{slug}",
        })
    return entries


def write_atomic(corpus_path: Path, payload: str) -> None:
    """os.replace garantiza atomicidad. Evita reads parciales del search.py durante MultiEdit en cascada."""
    corpus_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=corpus_path.parent, prefix=".corpus.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(payload)
        os.replace(tmp_path, corpus_path)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def main() -> int:
    gotchas_dir = find_gotchas_dir()
    if gotchas_dir is None:
        print("ERROR: Spec/gotchas/ no encontrado desde cwd. Correr desde el repo SecondMind.", file=sys.stderr)
        return 2
    files = sorted(gotchas_dir.glob("*.md"))
    if not files:
        print(f"ERROR: 0 archivos .md en {gotchas_dir}.", file=sys.stderr)
        return 2
    all_entries: list[dict[str, Any]] = []
    for f in files:
        all_entries.extend(parse_file(f))
    all_entries.sort(key=lambda e: (e["dominio"], e["id"]))
    payload = json.dumps(all_entries, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    write_atomic(CORPUS_PATH, payload)
    by_domain: dict[str, int] = {}
    for entry in all_entries:
        by_domain[entry["dominio"]] = by_domain.get(entry["dominio"], 0) + 1
    print(f"OK: {len(all_entries)} gotchas indexados desde {len(files)} archivos. corpus.json en {CORPUS_PATH}.")
    for domain in sorted(by_domain):
        print(f"  {domain}: {by_domain[domain]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
