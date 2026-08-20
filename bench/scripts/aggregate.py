#!/usr/bin/env python3
"""Aggregate bench/runs/* into per_task.csv, summary.json, and report.md.

Metrics per spec: PASS/PARTIAL/FAIL distribution, repeat disagreement flags,
hallucination rate, token stats (input/output/cache/cost), token_reduction_percent,
efficiency_ratio, broken out by task complexity (LOW/MEDIUM/HIGH).

Embedding/indexing credits are NOT included anywhere -- only the opencode agent
session token/cost figures from opencode_stats.json.
"""
import argparse
import csv
import json
import os
from collections import defaultdict

RESULT_ORDER = {"PASS": 0, "PARTIAL": 1, "FAIL": 2}
VERDICTS = ["KEEP GRAPHIFY", "REMOVE GRAPHIFY",
            "KEEP GRAPHIFY ONLY FOR MEDIUM/HIGH TASKS", "INSUFFICIENT EVIDENCE"]


def load_json(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return None


def mean(vals):
    vals = [v for v in vals if v is not None]
    return sum(vals) / len(vals) if vals else 0.0


def majority(vals):
    cnt = defaultdict(int)
    for v in vals:
        cnt[v] += 1
    return max(cnt, key=lambda k: (cnt[k], -RESULT_ORDER[k]))


def collect_runs(runs_dir, tasks_filter):
    runs = []
    for d in sorted(os.listdir(runs_dir)):
        rd = os.path.join(runs_dir, d)
        if not os.path.isdir(rd):
            continue
        parts = d.split("__")
        if len(parts) != 3 or not parts[2].startswith("r"):
            continue
        task_id, condition, rep = parts[0], parts[1], parts[2]
        try:
            repeat = int(rep[1:])
        except ValueError:
            continue
        if tasks_filter and task_id not in tasks_filter:
            continue
        result = load_json(os.path.join(rd, "result.json"))
        stats = load_json(os.path.join(rd, "opencode_stats.json"))
        hall = load_json(os.path.join(rd, "hallucination_check.json"))
        valid = bool(result and stats)
        runs.append({
            "dir": d, "task": task_id, "condition": condition, "repeat": repeat,
            "result": result or {}, "stats": stats or {}, "hall": hall or {},
            "valid": valid,
            "total_tokens": (stats or {}).get("total_tokens", 0),
            "cost": (stats or {}).get("cost", 0),
            "wall": (stats or {}).get("wall_clock_seconds", 0),
            "tool_calls": (stats or {}).get("tool_calls", 0),
        })
    return runs


def summarize_condition(group):
    """group = list of run dicts for one (task, condition) or a pool."""
    if not group:
        return None
    valid = [r for r in group if r["valid"]]
    results = [r["result"].get("task_result", "FAIL") for r in valid]
    hall = [r["hall"].get("hallucination_rate", 0.0) for r in valid]
    return {
        "n_runs": len(group),
        "n_valid": len(valid),
        "results": results,
        "majority": majority(results) if results else "FAIL",
        "disagreement": len(set(results)) > 1,
        "hallucination_rate": mean(hall),
        "missing_files": sorted({f for r in valid for f in r["hall"].get("missing_files", [])}),
        "total_tokens": mean([r["total_tokens"] for r in valid]),
        "cost": mean([r["cost"] for r in valid]),
        "wall": mean([r["wall"] for r in valid]),
        "tool_calls": mean([r["tool_calls"] for r in valid]),
        "checks_passed": all(r["result"].get("checks_passed", True) for r in valid),
    }


def pct_reduction(base, withg):
    if base is None or withg is None or base == 0:
        return None
    return 100.0 * (base - withg) / base


def efficiency(base, withg):
    if base is None or withg is None or withg == 0:
        return None
    return base / withg


def write_report(out_dir, tasks, task_summaries, overall, buckets, insufficient, reasons, verdict, model, t8_info):
    lines = []
    add = lines.append
    add("# Portafor Graphify A/B Benchmark Report")
    add("")
    add(f"- Model pinned: `{model}`")
    add("- Repeats: 1 per (task, condition); condition order alternates per task index")
    add("- Graphify: `graphify-ts` (indexing/embedding credits excluded from all token/cost figures)")
    add("")

    add("## Overall quality")
    add("")
    for cond in ("baseline", "graphify"):
        o = overall.get(cond) or {}
        add(f"- **{cond}**: majority results {o.get('majority_counts', {})} | "
            f"hallucination rate {o.get('hallucination_rate', 0):.3f}")
    add(f"- Tasks with repeat disagreement: {overall.get('disagreement_tasks', [])}")
    add("")
    add("## Efficiency")
    add("")
    add("| condition | total_tokens (mean) | input | output | cache read | cache write | cost | wall_clock_s | tool_calls |")
    add("|---|---|---|---|---|---|---|---|---|")
    for cond in ("baseline", "graphify"):
        o = overall.get(cond) or {}
        add(f"| {cond} | {o.get('total_tokens', 0):.0f} | {o.get('input_tokens', 0):.0f} | "
            f"{o.get('output_tokens', 0):.0f} | {o.get('cache_read', 0):.0f} | {o.get('cache_write', 0):.0f} | "
            f"${o.get('cost', 0):.4f} | {o.get('wall', 0):.1f} | {o.get('tool_calls', 0):.1f} |")
    add("")
    add("## Context efficiency")
    add("")
    add(f"- tokens_without_graphify = {overall.get('tokens_without_graphify', 0):.1f}")
    add(f"- tokens_with_graphify    = {overall.get('tokens_with_graphify', 0):.1f}")
    add(f"- token_reduction_percent = {overall.get('token_reduction_percent', 0):.1f}%")
    add(f"- efficiency_ratio        = {overall.get('efficiency_ratio', 0):.2f}x")
    add("")
    add("### By complexity bucket")
    add("")
    add("| complexity | baseline_tokens | graphify_tokens | reduction % | ratio |")
    add("|---|---|---|---|---|")
    for bucket in ("LOW", "MEDIUM", "HIGH"):
        b = buckets.get(bucket)
        if not b:
            continue
        add(f"| {bucket} | {b.get('base', 0):.0f} | {b.get('withg', 0):.0f} | "
            f"{b.get('reduction', 0):.1f}% | {b.get('ratio', 0):.2f}x |")
    add("")
    add("### Per task")
    add("")
    add("| task | baseline_tokens | graphify_tokens | reduction % | ratio | baseline_result | graphify_result | halluc (b/g) | checks_passed (b/g) |")
    add("|---|---|---|---|---|---|---|---|---|")
    for task in tasks:
        ts = task_summaries.get(task, {})
        base, withg = ts.get("baseline"), ts.get("graphify")
        if not base or not withg:
            add(f"| {task} | missing run | missing run | - | - | - | - | - | - |")
            continue
        add(f"| {task} | {base['total_tokens']:.0f} | {withg['total_tokens']:.0f} | "
            f"{ts.get('reduction', 0):.1f}% | {ts.get('ratio', 0):.2f}x | "
            f"{base['majority']} | {withg['majority']} | "
            f"{base['hallucination_rate']:.2f}/{withg['hallucination_rate']:.2f} | "
            f"{base['checks_passed']}/{withg['checks_passed']} |")
    add("")

    add("## Task 8 implementation")
    add("")
    for task in tasks:
        if task != "t8":
            continue
        for cond in ("baseline", "graphify"):
            info = t8_info.get(cond)
            if not info:
                add(f"- **{cond}**: no valid run")
                continue
            add(f"- **{cond}**: checks_passed={info['checks_passed']} | "
                f"files_changed={sorted(info['files_changed'])}")
        add("")
    add("Function citations for a manual grep spot-check are in each run's hallucination_check.json.")
    add("")
    add("## Decision")
    add("")
    add(f"**{verdict}**")
    if insufficient:
        add("")
        add("INSUFFICIENT EVIDENCE triggers:")
        for reason in reasons:
            add(f"- {reason}")
    add("")

    with open(os.path.join(out_dir, "report.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs-dir", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--min-repeats", type=int, default=1)
    ap.add_argument("--tasks", default="")
    ap.add_argument("--model", default="opencode/deepseek-v4-flash-free")
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    tasks_filter = [t.strip() for t in args.tasks.split(",") if t.strip()] if args.tasks else None

    runs = collect_runs(args.runs_dir, tasks_filter)

    by_task_cond = defaultdict(list)
    for r in runs:
        by_task_cond[(r["task"], r["condition"])].append(r)

    tasks = sorted({r["task"] for r in runs})

    task_summaries = {}
    t8_info = {}
    insufficient = False
    reasons = []

    for task in tasks:
        entry = {}
        for cond in ("baseline", "graphify"):
            g = by_task_cond.get((task, cond), [])
            if not g or not any(r["valid"] for r in g):
                insufficient = True
                reasons.append(f"task {task} condition {cond}: no valid runs")
            entry[cond] = summarize_condition(g)
            if task == "t8" and entry[cond]:
                valid = [r for r in g if r["valid"]]
                t8_info[cond] = {
                    "checks_passed": entry[cond]["checks_passed"],
                    "files_changed": sorted({f for r in valid for f in r["result"].get("files_changed", [])}),
                    "checks_run": sorted({c for r in valid for c in r["result"].get("checks_run", [])}),
                }
        base, withg = entry.get("baseline"), entry.get("graphify")
        if base and withg:
            entry["reduction"] = pct_reduction(base["total_tokens"], withg["total_tokens"])
            entry["ratio"] = efficiency(base["total_tokens"], withg["total_tokens"])
        task_summaries[task] = entry

    overall = {}
    disagreement_tasks = []
    for cond in ("baseline", "graphify"):
        group = [r for r in runs if r["condition"] == cond]
        s = summarize_condition(group)
        if not s:
            insufficient = True
            reasons.append(f"condition {cond}: no valid runs")
            overall[cond] = {"total_tokens": 0, "input_tokens": 0, "output_tokens": 0,
                             "cache_read": 0, "cache_write": 0, "cost": 0, "wall": 0,
                             "tool_calls": 0, "hallucination_rate": 0, "majority_counts": {},
                             "disagreement_tasks": []}
            continue
        valid = [r for r in group if r["valid"]]
        overall[cond] = {
            "total_tokens": mean([r["total_tokens"] for r in valid]),
            "input_tokens": mean([r["stats"].get("input_tokens", 0) for r in valid]),
            "output_tokens": mean([r["stats"].get("output_tokens", 0) for r in valid]),
            "cache_read": mean([r["stats"].get("cache_read_tokens", 0) for r in valid]),
            "cache_write": mean([r["stats"].get("cache_write_tokens", 0) for r in valid]),
            "cost": sum(r["cost"] for r in valid),
            "wall": mean([r["wall"] for r in valid]),
            "tool_calls": mean([r["tool_calls"] for r in valid]),
            "hallucination_rate": mean([r["hall"].get("hallucination_rate", 0.0) for r in valid]),
            "majority_counts": {
                k: sum(1 for r in valid if r["result"].get("task_result") == k)
                for k in ("PASS", "PARTIAL", "FAIL")
            },
            "disagreement_tasks": [],
        }

    for (task, cond), g in by_task_cond.items():
        s = summarize_condition(g)
        if s and s["disagreement"]:
            disagreement_tasks.append(f"{task}/{cond}")
    overall["disagreement_tasks"] = disagreement_tasks
    overall["tokens_without_graphify"] = overall["baseline"]["total_tokens"]
    overall["tokens_with_graphify"] = overall["graphify"]["total_tokens"]
    overall["token_reduction_percent"] = pct_reduction(overall["baseline"]["total_tokens"],
                                                       overall["graphify"]["total_tokens"])
    overall["efficiency_ratio"] = efficiency(overall["baseline"]["total_tokens"],
                                             overall["graphify"]["total_tokens"])

    if args.min_repeats > 1:
        for (task, cond), g in by_task_cond.items():
            if len([r for r in g if r["valid"]]) < args.min_repeats:
                insufficient = True
                reasons.append(f"task {task} condition {cond}: fewer than {args.min_repeats} repeats")
        if disagreement_tasks and len(disagreement_tasks) / max(1, len(tasks) * 2) > 0.30:
            insufficient = True
            reasons.append("repeat disagreement rate exceeds 30%")

    buckets = {}
    for bucket in ("LOW", "MEDIUM", "HIGH"):
        bgroup = [r for r in runs if (r["result"].get("complexity", "MEDIUM") or "MEDIUM").upper() == bucket]
        bbase = [r for r in bgroup if r["condition"] == "baseline" and r["valid"]]
        bwith = [r for r in bgroup if r["condition"] == "graphify" and r["valid"]]
        if not bbase and not bwith:
            continue
        b = {"base": mean([r["total_tokens"] for r in bbase]),
             "withg": mean([r["total_tokens"] for r in bwith])}
        b["reduction"] = pct_reduction(b["base"], b["withg"]) or 0.0
        b["ratio"] = efficiency(b["base"], b["withg"]) or 0.0
        buckets[bucket] = b

    verdict = None
    if insufficient:
        verdict = "INSUFFICIENT EVIDENCE"
    else:
        bpass = overall["baseline"]["majority_counts"]["PASS"]
        gpass = overall["graphify"]["majority_counts"]["PASS"]
        bfail = overall["baseline"]["majority_counts"]["FAIL"]
        gfail = overall["graphify"]["majority_counts"]["FAIL"]
        bhall = overall["baseline"]["hallucination_rate"]
        ghall = overall["graphify"]["hallucination_rate"]
        red = overall["token_reduction_percent"] or 0.0

        if gpass < bpass or gfail > bfail:
            verdict = "REMOVE GRAPHIFY"
        elif ghall > bhall + 1e-9:
            verdict = "REMOVE GRAPHIFY"
        elif red <= 0:
            verdict = "REMOVE GRAPHIFY"
        else:
            med_high_base = (buckets.get("MEDIUM", {}).get("base", 0) + buckets.get("HIGH", {}).get("base", 0))
            med_high_withg = (buckets.get("MEDIUM", {}).get("withg", 0) + buckets.get("HIGH", {}).get("withg", 0))
            med_high_red = pct_reduction(med_high_base, med_high_withg)
            low_red = buckets.get("LOW", {}).get("reduction")
            # Policy (AGENTS.md section 10): Graphify pays off on MEDIUM/HIGH
            # exploration-heavy tasks but regresses on LOW/simple ones.
            if med_high_red is not None and med_high_red > 10 and (low_red is None or low_red < 5):
                verdict = "KEEP GRAPHIFY ONLY FOR MEDIUM/HIGH TASKS"
            else:
                verdict = "KEEP GRAPHIFY"

    with open(os.path.join(args.out_dir, "per_task.csv"), "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(["task", "condition", "repeat", "task_result", "complexity", "total_tokens",
                    "input_tokens", "output_tokens", "cache_read", "cache_write", "cost",
                    "wall_clock_s", "tool_calls", "hallucination_rate", "missing_files",
                    "files_inspected", "files_changed", "checks_run", "checks_passed",
                    "unrelated_files_inspected"])
        for task in tasks:
            for cond in ("baseline", "graphify"):
                for r in by_task_cond.get((task, cond), []):
                    res = r["result"]
                    hall = r["hall"]
                    answer = str(res.get("answer", ""))
                    unrelated = [f for f in res.get("files_inspected", []) if f and f not in answer]
                    w.writerow([
                        task, cond, r["repeat"], res.get("task_result", "FAIL"),
                        res.get("complexity", "MEDIUM"), r["total_tokens"],
                        r["stats"].get("input_tokens", 0), r["stats"].get("output_tokens", 0),
                        r["stats"].get("cache_read_tokens", 0), r["stats"].get("cache_write_tokens", 0),
                        r["cost"], r["wall"], r["tool_calls"],
                        hall.get("hallucination_rate", 0.0), ";".join(hall.get("missing_files", [])),
                        ";".join(res.get("files_inspected", [])), ";".join(res.get("files_changed", [])),
                        ";".join(res.get("checks_run", [])), res.get("checks_passed", ""),
                        ";".join(unrelated)
                    ])

    summary = {
        "verdict": verdict,
        "insufficient_evidence": insufficient,
        "insufficient_reasons": reasons,
        "overall": overall,
        "buckets": buckets,
        "tasks": task_summaries,
        "t8_info": t8_info,
        "embedding_indexing_cost_excluded": True,
        "min_repeats": args.min_repeats,
    }
    with open(os.path.join(args.out_dir, "summary.json"), "w", encoding="utf-8") as fh:
        json.dump(summary, fh, indent=2)

    write_report(args.out_dir, tasks, task_summaries, overall, buckets, insufficient,
                 reasons, verdict, args.model, t8_info)
    print(f"verdict={verdict}")
    print(f"tokens_without_graphify={overall['tokens_without_graphify']:.1f} "
          f"tokens_with_graphify={overall['tokens_with_graphify']:.1f} "
          f"reduction={overall['token_reduction_percent']:.1f}% "
          f"ratio={overall['efficiency_ratio']:.2f}x")


if __name__ == "__main__":
    main()