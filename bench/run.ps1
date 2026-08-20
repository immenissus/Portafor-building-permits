# run.ps1 - Portafor Graphify A/B benchmark orchestrator.
#
# Runs `opencode run` sessions for each (task, condition, repeat) in a fresh
# detached worktree at $BaseCommit. Per run it captures:
#   - events.jsonl            raw NDJSON output of `opencode run --format json`
#   - prompt.md               the exact composed prompt (preamble + task)
#   - run.err.txt             stderr captured from opencode
#   - meta.json               task/condition/repeat/base_commit/model/wall time
#   - opencode_stats.json     session tokens + cost (embedding cost excluded)
#   - result.json             copied from the worktree (agent-written), or a
#                             FAIL placeholder when absent/invalid
#   - hallucination_check.json  file-existence + best-effort symbol grep verdict
#
# Condition order alternates per task index (even: baseline first; odd: graphify
# first) to spread drift. Graphify is installed per worktree with
# `graphify-ts generate .` + `graphify-ts opencode install`; the user-level
# opencode config is snapshotted/restored around each graphify run so baseline
# sessions are never contaminated.

[CmdletBinding()]
param(
    [string[]] $Tasks = @("t1", "t4", "t6", "t7", "t8"),
    [int] $Repeats = 1,
    [string] $Model = "opencode/deepseek-v4-flash-free",
    [string] $BaseCommit = "HEAD",
    [string] $RunsDir = "",
    [switch] $SkipGraphifyInstall,
    [switch] $KeepWorktrees,
    [switch] $SkipAggregate,
    [switch] $NoRestoreGlobalConfig
)

$ErrorActionPreference = "Stop"
if ($Tasks.Count -eq 1 -and $Tasks[0] -match ",") {
    $Tasks = $Tasks[0].Split(",") | ForEach-Object { $_.Trim() }
}
$RepoRoot = Split-Path -Parent $PSScriptRoot
$TasksDir = Join-Path $PSScriptRoot "tasks"
$PreambleFile = Join-Path $PSScriptRoot "preamble.md"
$ParseStats = Join-Path $PSScriptRoot "scripts\parse_stats.py"
$Verify = Join-Path $PSScriptRoot "scripts\verify_files_cited.py"
$Aggregate = Join-Path $PSScriptRoot "scripts\aggregate.py"
$StripJsonc = Join-Path $PSScriptRoot "scripts\strip_jsonc.py"
$WorktreesRoot = Join-Path $env:TEMP "portafor-bench-worktrees"
$GlobalConfig = Join-Path $env:USERPROFILE ".config\opencode\opencode.json"
if (-not $RunsDir) { $RunsDir = Join-Path $PSScriptRoot "runs" }
$AggOut = Join-Path $PSScriptRoot "aggregate"

if (-not (Test-Path $TasksDir)) { throw "tasks dir not found: $TasksDir" }
if (-not (Test-Path $PreambleFile)) { throw "preamble not found: $PreambleFile" }

function New-Worktree {
    param([string] $name)
    $wt = Join-Path $WorktreesRoot $name
    $saved = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        if (Test-Path $wt) { Remove-Item -Recurse -Force $wt }
        git worktree prune 2>&1 | Out-Null
        git worktree add --detach $wt $BaseCommit 2>&1 | Out-Null
    }
    finally {
        $ErrorActionPreference = $saved
    }
    if ($LASTEXITCODE -ne 0) { throw "git worktree add failed for $name" }
    return $wt
}

function Remove-Worktree {
    param([string] $name)
    $wt = Join-Path $WorktreesRoot $name
    $saved = $ErrorActionPreference
    $ErrorActionPreference = "SilentlyContinue"
    try {
        git worktree remove --force $wt 2>&1 | Out-Null
        Remove-Item -Recurse -Force $wt -ErrorAction SilentlyContinue
    }
    finally {
        $ErrorActionPreference = $saved
    }
}

function Ensure-Graphify {
    if ($SkipGraphifyInstall) { return }
    if (-not (Get-Command graphify-ts -ErrorAction SilentlyContinue)) {
        Write-Host "installing @mohammednagy/graphify-ts globally..."
        npm install -g @mohammednagy/graphify-ts
        if ($LASTEXITCODE -ne 0) { throw "failed to install graphify-ts" }
    }
    Write-Host ("graphify-ts: {0}" -f (& graphify-ts --version 2>&1))
}

function Backup-GlobalConfig {
    param([string] $runDir)
    if (Test-Path $GlobalConfig) {
        Copy-Item $GlobalConfig (Join-Path $runDir "opencode.json.before") -Force
    }
}

function Restore-GlobalConfig {
    param([string] $runDir)
    if ($NoRestoreGlobalConfig) { return }
    $before = Join-Path $runDir "opencode.json.before"
    if (Test-Path $before) { Copy-Item $before $GlobalConfig -Force }
    else { Remove-Item $GlobalConfig -ErrorAction SilentlyContinue }
}

function Invoke-Session {
    param([string] $task, [string] $condition, [int] $repeat, [int] $index)
    $name = "$task`__$condition`__r$repeat"
    $runDir = Join-Path $RunsDir $name
    New-Item -ItemType Directory -Path $runDir -Force | Out-Null

    $graphifyApplied = $false
    $wt = New-Worktree $name
    $fnEAP = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        if ($task -eq "t8") {
            if (-not (Test-Path (Join-Path $RepoRoot "node_modules"))) {
                throw "main repo node_modules missing (required for t8 typecheck/lint/test)"
            }
            New-Item -ItemType Junction -Path (Join-Path $wt "node_modules") `
                -Value (Join-Path $RepoRoot "node_modules") | Out-Null
        }

        $graphifyVersion = $null
        if ($condition -eq "graphify") {
            Ensure-Graphify
            Backup-GlobalConfig $runDir
            Push-Location $wt
            try {
                graphify-ts generate .
                if ($LASTEXITCODE -ne 0) { throw "graphify-ts generate failed" }
                python $StripJsonc --in (Join-Path $wt "opencode.json") `
                    --out (Join-Path $wt "opencode.json")
                if ($LASTEXITCODE -ne 0) { throw "strip_jsonc failed" }
                graphify-ts opencode install
                if ($LASTEXITCODE -ne 0) { throw "graphify-ts opencode install failed" }
                $graphifyApplied = $true
                $graphifyVersion = ((& graphify-ts --version 2>&1) | Out-String).Trim()
            }
            finally {
                Pop-Location
            }
        }

        $prompt = (Get-Content -Raw $PreambleFile).TrimEnd() + "`n`n" + `
                  (Get-Content -Raw (Join-Path $TasksDir "$task.md")).TrimEnd()
        Set-Content -Path (Join-Path $runDir "prompt.md") -Value $prompt -Encoding utf8

        $jsonl = Join-Path $runDir "events.jsonl"
        $err = Join-Path $runDir "run.err.txt"
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        & opencode run --format json --dir $wt --model $Model --auto $prompt 1> $jsonl 2> $err
        $code = $LASTEXITCODE
        $sw.Stop()
        $wall = [Math]::Round($sw.Elapsed.TotalSeconds, 3)

        python $ParseStats --events $jsonl --wall-clock $wall --model $Model `
            --out (Join-Path $runDir "opencode_stats.json")
        if ($LASTEXITCODE -ne 0) { throw "parse_stats failed for $name" }

        $srcResult = Join-Path $wt "result.json"
        $dstResult = Join-Path $runDir "result.json"
        if (Test-Path $srcResult) {
            Copy-Item $srcResult $dstResult -Force
            try { Get-Content $dstResult -Raw | ConvertFrom-Json | Out-Null }
            catch { Remove-Item $dstResult -Force }
        }
        if (-not (Test-Path $dstResult)) {
            $placeholder = @{
                task_id = $task; condition = $condition; repeat = $repeat;
                task_result = "FAIL"; checks_passed = $false;
                error = "no result.json produced in worktree; opencode exit=$code"
            } | ConvertTo-Json
            Set-Content -Path $dstResult -Value $placeholder -Encoding utf8
        }

        python $Verify --repo $wt --result $dstResult `
            --out (Join-Path $runDir "hallucination_check.json")
        if ($LASTEXITCODE -ne 0) { throw "verify_files_cited failed for $name" }

        $baseCommitResolved = (git -C $wt rev-parse HEAD)
        $meta = @{
            task = $task; condition = $condition; repeat = $repeat; index = $index;
            model = $Model; base_commit = $baseCommitResolved;
            opencode_exit = $code; wall_clock_seconds = $wall;
            graphify_version = $graphifyVersion;
            node_modules_junction = ($task -eq "t8");
            embedding_indexing_cost_excluded = $true;
        } | ConvertTo-Json
        Set-Content -Path (Join-Path $runDir "meta.json") -Value $meta -Encoding utf8

        Write-Host ("DONE {0} (exit={1}, wall={2}s)" -f $name, $code, $wall)
    }
    finally {
        $ErrorActionPreference = $fnEAP
        if ($condition -eq "graphify" -and $graphifyApplied) { Restore-GlobalConfig $runDir }
        if (-not $KeepWorktrees) { Remove-Worktree $name }
    }
}

New-Item -ItemType Directory -Path $RunsDir -Force | Out-Null
Write-Host ("benchmark: tasks=[{0}] repeats={1} model={2} base={3}" -f `
    ($Tasks -join ","), $Repeats, $Model, $BaseCommit)

for ($i = 0; $i -lt $Tasks.Count; $i++) {
    $t = $Tasks[$i]
    if (-not (Test-Path (Join-Path $TasksDir "$t.md"))) { throw "task file missing: $t.md" }
    for ($r = 1; $r -le $Repeats; $r++) {
        if ($i % 2 -eq 0) {
            Invoke-Session $t "baseline" $r $i
            Invoke-Session $t "graphify" $r $i
        }
        else {
            Invoke-Session $t "graphify" $r $i
            Invoke-Session $t "baseline" $r $i
        }
    }
}

if (-not $SkipAggregate) {
    python $Aggregate --runs-dir $RunsDir --out-dir $AggOut `
        --tasks ($Tasks -join ",") --min-repeats $Repeats --model $Model
    if ($LASTEXITCODE -ne 0) { throw "aggregate failed" }
    Write-Host "aggregate written to $AggOut"
}
Write-Host "benchmark complete. runs: $RunsDir"