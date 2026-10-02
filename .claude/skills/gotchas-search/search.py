#!/usr/bin/env python3
"""BM25 search sobre el corpus de gotchas SecondMind.

Carga corpus.json (generado por reindex.py), tokeniza la query con conciencia Unicode (acentos/ñ),
score BM25 con peso 2x sobre titulo + 1x sobre body, devuelve top-N en markdown o JSON.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from typing import Any

# Windows console default cp1252 chokes on Unicode arrows/em-dashes en bodies de gotchas. Forzar UTF-8 stdout.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]

CORPUS_PATH = Path(__file__).parent / "corpus.json"

# BM25 hyperparams. Convención estándar de ranking de texto.
BM25_K1 = 1.5
BM25_B = 0.75
TITLE_WEIGHT = 2.0


def tokenize(text: str) -> list[str]:
    """Tokenize Unicode-aware. Threshold > 1 para preservar tokens técnicos cortos (ui, css, h1, cf)."""
    s = re.sub(r"[^\w\s]", " ", text.lower(), flags=re.UNICODE)
    return [w for w in s.split() if len(w) > 1]


def bm25_score(query_tokens: list[str], doc_tokens: list[str], avg_dl: float, idf: dict[str, float]) -> float:
    """Compute BM25 score for a single document given query tokens, doc tokens, avg doc length, idf table."""
    if not doc_tokens:
        return 0.0
    dl = len(doc_tokens)
    tf: dict[str, int] = {}
    for token in doc_tokens:
        tf[token] = tf.get(token, 0) + 1
    score = 0.0
    for q in query_tokens:
        if q not in idf:
            continue
        f = tf.get(q, 0)
        if f == 0:
            continue
        numerator = f * (BM25_K1 + 1)
        denominator = f + BM25_K1 * (1 - BM25_B + BM25_B * dl / avg_dl)
        score += idf[q] * numerator / denominator
    return score


def build_idf(corpus: list[dict[str, Any]]) -> tuple[dict[str, float], float]:
    """Build IDF table over the body field. Returns (idf, avg_doc_length)."""
    n = len(corpus)
    df: dict[str, int] = {}
    total_dl = 0
    for entry in corpus:
        tokens = set(tokenize(entry["body"]))
        total_dl += len(tokenize(entry["body"]))
        for token in tokens:
            df[token] = df.get(token, 0) + 1
    idf: dict[str, float] = {}
    for token, freq in df.items():
        # BM25+ smoothing: idf = log((N - df + 0.5) / (df + 0.5) + 1)
        idf[token] = math.log((n - freq + 0.5) / (freq + 0.5) + 1)
    avg_dl = total_dl / n if n > 0 else 0
    return idf, avg_dl


def search(query: str, corpus: list[dict[str, Any]], domain_filter: str | None, n: int, threshold: float) -> list[tuple[float, dict[str, Any]]]:
    """Filter by domain if provided, score all entries, return top-N above threshold."""
    pool = [e for e in corpus if domain_filter is None or e["dominio"] == domain_filter]
    if not pool:
        return []
    query_tokens = tokenize(query)
    if not query_tokens:
        return []
    idf, avg_dl = build_idf(pool)
    results: list[tuple[float, dict[str, Any]]] = []
    for entry in pool:
        body_tokens = tokenize(entry["body"])
        title_tokens = tokenize(entry["titulo"])
        body_score = bm25_score(query_tokens, body_tokens, avg_dl, idf)
        # Title score uses same idf table (consistent space) but weighted higher.
        title_score = bm25_score(query_tokens, title_tokens, max(avg_dl, 1), idf) * TITLE_WEIGHT
        total = body_score + title_score
        if total >= threshold:
            results.append((total, entry))
    results.sort(key=lambda x: x[0], reverse=True)
    return results[:n]


def format_markdown(results: list[tuple[float, dict[str, Any]]]) -> str:
    if not results:
        return "(sin hits)"
    lines: list[str] = []
    for i, (score, entry) in enumerate(results, 1):
        lines.append(f"### Hit {i} — score {score:.2f} — {entry['archivo_canonico']}")
        lines.append("")
        lines.append(f"**{entry['titulo']}**")
        lines.append("")
        lines.append(entry["body"])
        lines.append("")
        lines.append(f"Anchor: {entry['anchor_url']}")
        if entry.get("paths_referenciados"):
            lines.append(f"Paths: {', '.join(entry['paths_referenciados'])}")
        lines.append("")
    return "\n".join(lines)


def format_json(results: list[tuple[float, dict[str, Any]]]) -> str:
    payload = [{"score": round(score, 4), **entry} for score, entry in results]
    return json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="BM25 search sobre el corpus de gotchas SecondMind.",
        epilog="Reindex automatico via PostToolUse hook al editar Spec/gotchas/*.md.",
    )
    parser.add_argument("query", nargs="?", help="Query string. Tokenizada Unicode-aware.")
    parser.add_argument("--domain", help="Filtrar por dominio (ej. editor-tiptap, tinybase-firestore).")
    parser.add_argument("-n", type=int, default=5, help="Max hits (default 5).")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown", help="Output format.")
    parser.add_argument("--score-threshold", type=float, default=0.0, help="Score minimo para incluir hit.")
    parser.add_argument("--list-domains", action="store_true", help="Listar dominios disponibles + count.")
    args = parser.parse_args()

    if not CORPUS_PATH.exists():
        print(f"ERROR: corpus.json no encontrado en {CORPUS_PATH}. Correr reindex.py desde el repo SecondMind.", file=sys.stderr)
        return 2
    corpus: list[dict[str, Any]] = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))

    if args.list_domains:
        counts: dict[str, int] = {}
        for entry in corpus:
            counts[entry["dominio"]] = counts.get(entry["dominio"], 0) + 1
        for domain in sorted(counts):
            print(f"{domain}: {counts[domain]}")
        print(f"total: {len(corpus)}")
        return 0

    if not args.query:
        parser.error("query es requerido (o usar --list-domains)")

    results = search(args.query, corpus, args.domain, args.n, args.score_threshold)
    if args.format == "markdown":
        print(format_markdown(results))
    else:
        print(format_json(results))
    return 0


if __name__ == "__main__":
    sys.exit(main())
