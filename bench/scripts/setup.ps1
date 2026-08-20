# setup.ps1 - Verify/pin the toolchain needed to run the Portafor Graphify
# A/B benchmark (bench/run.ps1) and to use Graphify per the AGENTS.md policy.
#
# Checks: node, npm, git, python, opencode CLI. Installs and pins
# @mohammednagy/graphify-ts (global) if missing or at the wrong version.

[CmdletBinding()]
param(
    [string] $GraphifyVersion = "0.23.1"
)

$ErrorActionPreference = "Stop"

function Test-Cmd {
    param([string] $name, [string] $hint)
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) {
        $ver = & $name --version 2>&1 | Select-Object -First 1
        Write-Host ("{0}: {1}" -f $name, $ver)
        return $true
    }
    Write-Host ("{0}: MISSING {1}" -f $name, $hint) -ForegroundColor Red
    return $false
}

$ok = $true
$ok = (Test-Cmd "node" "install Node 20+") -and $ok
$ok = (Test-Cmd "npm" "installed with Node") -and $ok
$ok = (Test-Cmd "git" "install git") -and $ok
$ok = (Test-Cmd "python" "install Python 3") -and $ok
$ok = (Test-Cmd "opencode" "install the opencode CLI") -and $ok

$g = Get-Command graphify-ts -ErrorAction SilentlyContinue
if (-not $g) {
    Write-Host "graphify-ts: MISSING - installing @mohammednagy/graphify-ts@$GraphifyVersion..."
    npm install -g "@mohammednagy/graphify-ts@$GraphifyVersion"
    if ($LASTEXITCODE -ne 0) { throw "failed to install graphify-ts" }
}
else {
    $installed = (& graphify-ts --version 2>&1 | Select-Object -First 1)
    Write-Host "graphify-ts: $installed"
    if ($installed -ne $GraphifyVersion) {
        Write-Host "graphify-ts version mismatch - pinning to $GraphifyVersion..."
        npm install -g "@mohammednagy/graphify-ts@$GraphifyVersion"
        if ($LASTEXITCODE -ne 0) { throw "failed to pin graphify-ts" }
    }
}

$repoHead = git -C $PSScriptRoot\..\.. rev-parse --short HEAD
Write-Host "repo HEAD: $repoHead"

if (-not $ok) { throw "missing required tooling (see above)" }
Write-Host "setup complete."