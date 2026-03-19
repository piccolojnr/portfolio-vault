#!/usr/bin/env python3
"""
Storage abstraction test
========================

Covers three checks:
  1. Local backend  — upload lands at local_storage/{corpus_id}/{hash}/{filename}
  2. Supabase backend — same upload path goes to Supabase Storage bucket
  3. Index probe    — EXPLAIN confirms idx_documents_file_hash is used

Usage (run from repo root with the API server already running):

  # Test 1 — local (default)
  python rag/scripts/test_storage.py

  # Test 1 with a specific file
  python rag/scripts/test_storage.py --file rag/bio.md

  # Test 3 — index probe only (no server needed, needs DATABASE_URL in .env)
  python rag/scripts/test_storage.py --index-only

Switch to Supabase for Test 2:
  Set STORAGE_PROVIDER=supabase in rag/.env (plus SUPABASE_STORAGE_URL,
  SUPABASE_STORAGE_KEY, STORAGE_BUCKET), restart the API, then re-run.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

RAG_DIR = Path(__file__).parents[1]
BASE_URL = "http://localhost:8000"
CORPUS_ID = "default"


def _sep(title: str) -> None:
    print(f"\n{'─' * 60}")
    print(f"  {title}")
    print('─' * 60)


# ---------------------------------------------------------------------------
# Test 1 + 2 — upload via API
# ---------------------------------------------------------------------------

def test_upload(file_path: Path) -> dict:
    try:
        import httpx
    except ImportError:
        sys.exit("httpx not installed — run: pip install httpx")

    data = file_path.read_bytes()
    expected_hash = hashlib.sha256(data).hexdigest()
    expected_path_suffix = f"{CORPUS_ID}/{expected_hash}/{file_path.name}"

    _sep(f"Upload: {file_path.name}")
    print(f"  file        : {file_path}")
    print(f"  size        : {len(data):,} bytes")
    print(f"  sha256      : {expected_hash}")
    print(f"  expect path : .../{expected_path_suffix}")

    with httpx.Client(timeout=30) as client:
        res = client.post(
            f"{BASE_URL}/api/v1/storage/test-upload",
            files={"file": (file_path.name, data, "application/octet-stream")},
        )

    if res.status_code != 200:
        print(f"\n  ✗ HTTP {res.status_code}: {res.text}")
        sys.exit(1)

    result = res.json()
    print(f"\n  stored_path : {result['stored_path']}")
    print(f"  url         : {result['url']}")

    # ── Local backend check ────────────────────────────────────────────────
    stored = result["stored_path"]
    if Path(stored).exists():
        print(f"\n  ✓ LOCAL: file exists on disk at:")
        print(f"    {stored}")
        # Verify content integrity
        on_disk_hash = hashlib.sha256(Path(stored).read_bytes()).hexdigest()
        if on_disk_hash == expected_hash:
            print(f"  ✓ hash matches — content intact")
        else:
            print(f"  ✗ hash MISMATCH — expected {expected_hash}, got {on_disk_hash}")
    else:
        # Supabase path — stored_path is just the object key, not a local file
        if result["url"]:
            print(f"\n  ✓ SUPABASE: public URL returned")
            print(f"    {result['url']}")
        else:
            print(f"\n  ✗ Neither a local file nor a public URL — check your config")
            sys.exit(1)

    # Verify path structure contains corpus_id/hash/filename
    if expected_path_suffix in stored.replace("\\", "/"):
        print(f"  ✓ path structure matches {CORPUS_ID}/{{hash}}/{{filename}}")
    else:
        print(f"  ✗ path structure mismatch — got: {stored}")

    return result


# ---------------------------------------------------------------------------
# Test 3 — index probe
# ---------------------------------------------------------------------------

def test_index(file_hash: str | None = None) -> None:
    _sep("Index probe: idx_documents_file_hash")

    sys.path.insert(0, str(RAG_DIR / "src"))
    from memra.app.core.config import get_settings
    settings = get_settings()

    if not settings.database_url:
        print("  ✗ DATABASE_URL not set — skipping")
        return

    import psycopg2
    conn = psycopg2.connect(settings.database_url)
    cur = conn.cursor()

    # NOTE: the documents table has no corpus_id column — the index is on
    # file_hash only.  If you need to scope by corpus use the slug prefix or
    # a future corpus_id column.
    probe_hash = file_hash or "0" * 64  # non-existent hash — still exercises the index

    cur.execute(
        "EXPLAIN (FORMAT JSON) SELECT * FROM documents WHERE file_hash = %s",
        (probe_hash,),
    )
    plan = cur.fetchone()[0]
    plan_text = json.dumps(plan, indent=2)

    # Extract the node type from the top-level plan
    top_node = plan[0]["Plan"]["Node Type"]
    index_used = "idx_documents_file_hash" in plan_text

    print(f"  probe hash  : {probe_hash}")
    print(f"  top node    : {top_node}")
    print(f"  index hit   : {'✓ yes — idx_documents_file_hash' if index_used else '✗ no — seq scan'}")

    if not index_used:
        print("\n  (small table may prefer seq scan; force with SET enable_seqscan=off)")
        cur.execute("SET enable_seqscan = off")
        cur.execute(
            "EXPLAIN (FORMAT JSON) SELECT * FROM documents WHERE file_hash = %s",
            (probe_hash,),
        )
        plan2 = cur.fetchone()[0]
        index_used2 = "idx_documents_file_hash" in json.dumps(plan2)
        print(f"  with seqscan off: {'✓ index used' if index_used2 else '✗ still no index — check migration was applied'}")

    # Also show the lookup that duplicate detection would use
    print(f"\n  Duplicate-detection SQL:")
    print(f"    SELECT id, slug, file_hash FROM documents")
    print(f"    WHERE file_hash = '<hash>';")
    print(f"  (No corpus_id column in schema — scope by slug prefix if needed)")

    cur.close()
    conn.close()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", type=Path, default=RAG_DIR.parent / "bio.md",
                        help="File to upload (default: bio.md)")
    parser.add_argument("--index-only", action="store_true",
                        help="Skip upload, only run the index probe")
    args = parser.parse_args()

    uploaded_hash = None

    if not args.index_only:
        if not args.file.exists():
            sys.exit(f"File not found: {args.file}")
        result = test_upload(args.file)
        uploaded_hash = result["file_hash"]

    test_index(uploaded_hash)

    print(f"\n{'─' * 60}")
    print("  Done.")
    print('─' * 60)
