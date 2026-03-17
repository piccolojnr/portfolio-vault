#!/usr/bin/env python
"""
ingest_cli.py — Bulk directory ingestion CLI
# TODO: implement bulk ingestion from filesystem path

Usage (once implemented):
  python ingest_cli.py --corpus-id <id> --path ./your-directory [--limit 500]

This tool bypasses browser limitations for ingesting large directories.
Run `python ingest_cli.py --help` for full options.
"""
import argparse
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="Bulk file ingestion (TODO)")
    parser.add_argument("--corpus-id", required=True, help="Target corpus ID")
    parser.add_argument("--path", required=True, help="Directory to ingest")
    parser.add_argument("--limit", type=int, default=500, help="Max files (default 500)")
    args = parser.parse_args()
    print(f"TODO: ingest {args.path} into corpus {args.corpus_id} (limit {args.limit})")
    sys.exit(1)


if __name__ == "__main__":
    main()
