#!/usr/bin/env python3
"""Hallucination verifier: check that every cited/changed file exists in the worktree.

Only file existence is checked automatically (cheap + reliable). Function/symbol
citations get a best-effort `git grep` pass and are reported as INFORMATIONAL --
the final report flags them for a manual spot-check, per the benchmark spec.
"""
import argparse
import json
import os
import subprocess


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, help="worktree root to check against")
    ap.add_argument("--result", required=True, help="run result.json")
    ap.add_argument("--out", required=True, help="hallucination_check.json output path")
    args = ap.parse_args()

    with open(args.result, encoding="utf-8") as fh:
        result = json.load(fh)

    cited = list(result.get("files_inspected", [])) + list(result.get("files_changed", []))
    missing = [f for f in cited if not os.path.exists(os.path.join(args.repo, f))]

    # Best-effort function/symbol grep (informational only).
    funcs_missing = []
    funcs_checked = 0
    for sym in result.get("functions_or_symbols_cited", []):
        name = sym.strip().rstrip("(").strip()
        if not name:
            continue
        funcs_checked += 1
        try:
            r = subprocess.run(
                ["git", "-C", args.repo, "grep", "-l", name, "--", "*.ts", "*.tsx"],
                capture_output=True, text=True, timeout=30,
            )
            if r.returncode != 0 or not r.stdout.strip():
                funcs_missing.append(sym)
        except Exception:
            funcs_missing.append(f"{sym} (grep unavailable)")

    verdict = {
        "task_id": result.get("task_id"),
        "condition": result.get("condition"),
        "repeat": result.get("repeat"),
        "cited_files": len(cited),
        "missing_files": missing,
        "hallucination_rate": len(missing) / max(1, len(cited)),
        "functions_cited": result.get("functions_or_symbols_cited", []),
        "functions_grep_checked": funcs_checked,
        "functions_not_found": funcs_missing,
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(verdict, fh, indent=2)


if __name__ == "__main__":
    main()