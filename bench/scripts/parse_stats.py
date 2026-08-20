#!/usr/bin/env python3
"""Parse the NDJSON event stream from `opencode run --format json` into
opencode_stats.json.

Token/cost figures come ONLY from `step_finish` events (the LLM agent session).
Graphify indexing/embedding cost is excluded by design -- this file never sees it.

Tool calls are counted from `tool` / `tool_start` events (invocation starts).
Wall-clock seconds are supplied by the orchestrator (process-level timing).
"""
import argparse
import json


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--events", required=True, help="raw NDJSON event stream (stdout+stderr)")
    ap.add_argument("--out", required=True, help="opencode_stats.json output path")
    ap.add_argument("--wall-clock", type=float, default=0.0)
    ap.add_argument("--model", default="")
    args = ap.parse_args()

    totals = {"input": 0, "output": 0, "reasoning": 0, "cache_read": 0, "cache_write": 0, "total": 0}
    cost = 0.0
    tool_calls = 0
    turns = 0
    session_id = None
    events_parsed = 0

    with open(args.events, "rb") as fh:
        raw = fh.read()
    if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
        text = raw.decode("utf-16")
    elif raw.startswith(b"\xef\xbb\xbf"):
        text = raw.decode("utf-8-sig")
    else:
        text = raw.decode("utf-8", errors="replace")

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            ev = json.loads(line)
        except ValueError:
            continue
        if not isinstance(ev, dict):
            continue
        events_parsed += 1
        etype = ev.get("type")
        if not session_id and ev.get("sessionID"):
            session_id = ev["sessionID"]
        if etype == "step_finish":
            part = ev.get("part") or {}
            toks = part.get("tokens") or {}
            totals["input"] += toks.get("input") or 0
            totals["output"] += toks.get("output") or 0
            totals["reasoning"] += toks.get("reasoning") or 0
            totals["total"] += toks.get("total") or 0
            cache = toks.get("cache") or {}
            totals["cache_read"] += cache.get("read") or 0
            totals["cache_write"] += cache.get("write") or 0
            cost += part.get("cost") or 0
            turns += 1
        elif etype in ("tool", "tool_start", "tool_use"):
            tool_calls += 1

    stats = {
        "model": args.model,
        "session_id": session_id,
        "events_parsed": events_parsed,
        "wall_clock_seconds": round(args.wall_clock, 3),
        "agent_turns": turns,
        "tool_calls": tool_calls,
        "input_tokens": totals["input"],
        "output_tokens": totals["output"],
        "reasoning_tokens": totals["reasoning"],
        "cache_read_tokens": totals["cache_read"],
        "cache_write_tokens": totals["cache_write"],
        "total_tokens": totals["total"],
        "cost": round(cost, 6),
        "embedding_indexing_cost_excluded": True,
        "note": (
            "Token/cost figures measure the opencode agent session only "
            "(summed from step_finish events). Graphify indexing/embedding "
            "costs are excluded by design."
        ),
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(stats, fh, indent=2)


if __name__ == "__main__":
    main()