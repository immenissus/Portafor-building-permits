You are working in an isolated git worktree of the Portafor repo (a Next.js 16 +
TypeScript SaaS that polls municipal Socrata SODA permit/business-license feeds,
geocodes addresses, matches them to contractor service territories with PostGIS,
and emails matched contractors).

Ground rules:
- Do not commit or push. Do not modify production config, secrets, or any
  external service. Do not attempt to run the dev server, call a database, or
  hit external APIs — all analysis must be static / code-level.
- There is no .env in this worktree. Never try to load or invent secrets.
- Work normally: read, search, and reason exactly as you would in a normal
  session. Do not try to minimize tokens or "be efficient" — just do the task.
- Unless the task explicitly says "You may change files", treat the task as
  READ-ONLY: read and analyze, change nothing.

When you finish, write your structured answer to a file named `result.json` in
the current working directory (the worktree root), matching this schema exactly
(all fields present, correct types):

{
  "task_id": "t1",
  "condition": "baseline",
  "repeat": 1,
  "task_result": "PASS | PARTIAL | FAIL",
  "files_inspected": ["app/api/jobs/poll/route.ts", "lib/db/schema.ts"],
  "files_changed": [],
  "functions_or_symbols_cited": ["pollJurisdiction()", "advanceWatermark()"],
  "checks_run": [],
  "checks_passed": true,
  "complexity": "LOW | MEDIUM | HIGH",
  "uncertainty_notes": "anything you were not sure about, or empty string",
  "answer": "the actual diagnosis / trace / implementation summary"
}

Field guidance:
- task_result: PASS if you fully and confidently completed the task; PARTIAL if
  you covered most of it but something material remains uncertain; FAIL otherwise.
- files_inspected: every repo file you actually opened/read (or searched deeply
  enough to rely on). Use paths relative to the worktree root, exactly as they
  exist in the repo. Be complete — include everything you looked at.
- files_changed: list any files you modified. Empty for read-only tasks.
- functions_or_symbols_cited: the exact function/type/export names you reference
  in your answer (e.g. "pollJurisdiction", "verifyAdminKey").
- checks_run: exact shell commands you ran. Empty for read-only tasks.
- checks_passed: true only if every command in checks_run exited 0. Read-only
  tasks leave this true.
- complexity: your honest self-assessment of the task's difficulty.
- answer: a thorough, accurate write-up. Use concrete file paths and line numbers
  where possible, and name the exact functions involved. Do not pad or invent.

TASK: