param(
    [ValidateSet("amoy", "localhost")]
    [string]$Network = "amoy",
    [switch]$SkipPhase1
)

$ErrorActionPreference = "Stop"

$repoRoot = "C:\Users\ASUS\Projects\BlockVote"
$contractRoot = Join-Path $repoRoot "smart-contract"
$zkpConfigPath = Join-Path $repoRoot "dapp\src\config\zkpConfig.js"
$deploymentFile = Join-Path $contractRoot "deployments\$Network.json"
$envFile = Join-Path $contractRoot ".env"

function Import-DotEnv {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return
    }

    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmed) -or $trimmed.StartsWith("#")) {
            continue
        }

        $parts = $trimmed.Split("=", 2)
        if ($parts.Count -ne 2) {
            continue
        }

        $key = $parts[0].Trim()
        $value = $parts[1].Trim().Trim('"').Trim("'")

        if ([string]::IsNullOrWhiteSpace($key)) {
            continue
        }

        if (-not (Get-Item -Path "Env:$key" -ErrorAction SilentlyContinue)) {
            Set-Item -Path "Env:$key" -Value $value
        }
    }
}

function Require-EnvVar {
    param([string]$Name)
    $value = (Get-Item -Path "Env:$Name" -ErrorAction SilentlyContinue).Value
    if (-not $value -or [string]::IsNullOrWhiteSpace($value)) {
        throw "Missing required environment variable: $Name"
    }
}

Write-Host "`n[1/7] Validating environment..." -ForegroundColor Yellow
Import-DotEnv $envFile
Require-EnvVar "TRUSTEE_1"
Require-EnvVar "TRUSTEE_2"
Require-EnvVar "TRUSTEE_3"
if ($Network -eq "amoy") {
    Require-EnvVar "AMOY_RPC_URL"
    Require-EnvVar "PRIVATE_KEY"
}

Set-Location $contractRoot
$env:DEPLOY_NETWORK = $Network

Write-Host "`n[2/7] Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    throw "npm install failed"
}

Write-Host "`n[3/7] Compiling contracts (Hardhat)..." -ForegroundColor Yellow
npm run compile
if ($LASTEXITCODE -ne 0) {
    throw "Compile failed"
}

Write-Host "`n[4/7] Deploying contracts via Hardhat ($Network)..." -ForegroundColor Yellow
if ($Network -eq "amoy") {
    npm run deploy:amoy
} else {
    npm run deploy:local
}
if ($LASTEXITCODE -ne 0) {
    throw "Deployment failed"
}

Write-Host "`n[5/7] Exporting frontend artifacts..." -ForegroundColor Yellow
if ($Network -eq "amoy") {
    npm run export:frontend:amoy
} else {
    npm run export:frontend:local
}
if ($LASTEXITCODE -ne 0) {
    throw "Frontend artifact export failed"
}

if (-not (Test-Path $deploymentFile)) {
    throw "Deployment file missing: $deploymentFile"
}
$deployment = Get-Content $deploymentFile -Raw | ConvertFrom-Json
$contractAddress = $deployment.mainContract.address
$verifierAddress = $deployment.verifier.address
$chainId = [string]$deployment.chainId

Write-Host "`n[6/7] Updating verifier address in zkp config..." -ForegroundColor Yellow
$configContent = Get-Content $zkpConfigPath -Raw
$configContent = $configContent -replace "address:\s*'0x[a-fA-F0-9]{40}'", "address: '$verifierAddress'"
Set-Content -Path $zkpConfigPath -Value $configContent

if (-not $SkipPhase1.IsPresent) {
    Write-Host "`n[7/7] Running Phase 1 setup..." -ForegroundColor Yellow
    npm run phase1
    if ($LASTEXITCODE -ne 0) {
        throw "Phase 1 setup failed"
    }
} else {
    Write-Host "`n[7/7] Skipping Phase 1 setup (requested)." -ForegroundColor DarkYellow
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   Deployment Complete (Hardhat)" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Network:           $Network" -ForegroundColor White
Write-Host "Chain ID:          $chainId" -ForegroundColor White
Write-Host "Main Contract:     $contractAddress" -ForegroundColor White
Write-Host "Groth16Verifier:   $verifierAddress" -ForegroundColor White
Write-Host "Deployment file:   $deploymentFile" -ForegroundColor White
Write-Host "========================================`n" -ForegroundColor Cyan

Set-Location $repoRoot
