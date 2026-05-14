# scripts/dev.ps1 — one-shot dev workflow.
# Kills any stale Node on :3456, starts a fresh dev-server, runs the test suite,
# opens the game in browser. Use this instead of remembering Stop-Process + node.
#
# Usage:
#   npm run dev
# Or directly:
#   pwsh scripts/dev.ps1

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot
Write-Host ""
Write-Host "═══ KVTM 2.0 dev workflow ═══" -ForegroundColor Cyan
Write-Host "Repo: $RepoRoot"

# 1. Kill any stale Node listening on :3456
Write-Host ""
Write-Host "[1/4] Checking for stale dev-server..." -ForegroundColor Yellow
$listening = netstat -ano | Select-String ':3456 ' | Select-String 'LISTENING'
if ($listening) {
    $stalePids = $listening | ForEach-Object {
        ($_ -split '\s+')[-1]
    } | Where-Object { $_ -match '^\d+$' -and $_ -ne '0' } | Select-Object -Unique
    foreach ($p in $stalePids) {
        try {
            Stop-Process -Id $p -Force -ErrorAction Stop
            Write-Host "  ✓ Killed stale Node PID $p" -ForegroundColor Green
        } catch {
            Write-Host "  ✗ Could not kill PID $p`: $_" -ForegroundColor Red
        }
    }
    Start-Sleep -Milliseconds 500
} else {
    Write-Host "  ✓ Port 3456 free" -ForegroundColor Green
}

# 2. Run tests — block if any fail
Write-Host ""
Write-Host "[2/4] Running tests..." -ForegroundColor Yellow
$testOutput = & npm test 2>&1
$testExit = $LASTEXITCODE
if ($testExit -ne 0) {
    Write-Host "  ✗ Tests FAILED — fix before starting server" -ForegroundColor Red
    Write-Host $testOutput
    exit 1
}
$summaryLine = $testOutput | Select-String 'tests \d+' | Select-Object -Last 1
Write-Host "  ✓ $summaryLine" -ForegroundColor Green

# 3. Start dev-server in background
Write-Host ""
Write-Host "[3/4] Starting dev-server..." -ForegroundColor Yellow
$serverProcess = Start-Process -FilePath node -ArgumentList 'scripts/dev-server.js' -PassThru -NoNewWindow -RedirectStandardOutput "$env:TEMP\kvtm-dev.log"
Start-Sleep -Seconds 1

# 4. Verify server actually started
try {
    $tokenJson = Invoke-RestMethod -Uri 'http://localhost:3456/api/token' -TimeoutSec 3
    Write-Host "  ✓ Server up (PID $($serverProcess.Id), token $($tokenJson.token.Substring(0,8))...)" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Server not responding — check $env:TEMP\kvtm-dev.log" -ForegroundColor Red
    Get-Content "$env:TEMP\kvtm-dev.log" | Write-Host
    exit 1
}

# 5. Open browser
Write-Host ""
Write-Host "[4/4] Opening browser..." -ForegroundColor Yellow
Start-Process 'http://localhost:3456/kvtm_2_0_game.html'
Write-Host "  ✓ Game:   http://localhost:3456/kvtm_2_0_game.html"
Write-Host "  ✓ Editor: http://localhost:3456/tools/level_editor.html"
Write-Host "  ✓ Bloom:  http://localhost:3456/tools/bloom_test.html"
Write-Host ""
Write-Host "Server log: $env:TEMP\kvtm-dev.log" -ForegroundColor DarkGray
Write-Host "To stop: Stop-Process -Id $($serverProcess.Id)" -ForegroundColor DarkGray
Write-Host ""
