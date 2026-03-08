# Step 1: Deploy contracts
Write-Host "`n[1/6] Deploying contracts to Ganache..." -ForegroundColor Yellow
Set-Location "C:\Users\ASUS\Projects\BlockVote\smart-contract"
truffle migrate --reset --network development

if ($LASTEXITCODE -ne 0) {
    Write-Host "Deployment failed!" -ForegroundColor Red
    Set-Location "C:\Users\ASUS\Projects\BlockVote"
    exit 1
}

# Step 2: Verify Verifier is linked (already handled by migration 3)
# Migration 3 calls setVoteVerifier automatically — this step just confirms it.
Write-Host "`n[2/6] Verifying Groth16Verifier is linked..." -ForegroundColor Yellow
truffle exec set-verifier.js --network development

if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: verifier link check failed (may already be set by migration)." -ForegroundColor DarkYellow
}

# Step 2.5: Phase 1 Setup (Paillier Key Generation & Secret Sharing)
Write-Host "`n[2.5/6] Running Phase 1: Key Generation & Secret Sharing..." -ForegroundColor Yellow
node phase1-setup.js

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to complete Phase 1 setup!" -ForegroundColor Red
    Set-Location "C:\Users\ASUS\Projects\BlockVote"
    exit 1
}

# Step 3: Copy contract files
Write-Host "`n[3/6] Copying contract files to React app..." -ForegroundColor Yellow
Copy-Item -Path "C:\Users\ASUS\Projects\BlockVote\smart-contract\build\contracts\Contract.json" `
          -Destination "C:\Users\ASUS\Projects\BlockVote\dapp\src\contract.json" `
          -Force

Copy-Item -Path "C:\Users\ASUS\Projects\BlockVote\smart-contract\build\contracts\Groth16Verifier.json" `
          -Destination "C:\Users\ASUS\Projects\BlockVote\dapp\src\Verifier.json" `
          -Force

Write-Host "Contract files copied successfully!" -ForegroundColor Green

# Step 4: Extract contract addresses
Write-Host "`n[4/6] Extracting contract addresses..." -ForegroundColor Yellow
$contractJson = Get-Content "C:\Users\ASUS\Projects\BlockVote\dapp\src\contract.json" | ConvertFrom-Json
$verifierJson = Get-Content "C:\Users\ASUS\Projects\BlockVote\dapp\src\Verifier.json" | ConvertFrom-Json

$contractAddress = $contractJson.networks.'5777'.address
$verifierAddress = $verifierJson.networks.'5777'.address

# Step 5: Update zkpConfig.js with new verifier address
Write-Host "`n[5/6] Updating zkpConfig.js..." -ForegroundColor Yellow
$configPath = "C:\Users\ASUS\Projects\BlockVote\dapp\src\config\zkpConfig.js"
$configContent = Get-Content $configPath -Raw
$configContent = $configContent -replace "address: '0x[a-fA-F0-9]{40}'", "address: '$verifierAddress'"
Set-Content -Path $configPath -Value $configContent

# Step 6: Display Paillier Public Key
Write-Host "`n[6/6] Retrieving Paillier Public Key from Blockchain..." -ForegroundColor Yellow
$getKeyScript = @"
const { Web3 } = require('web3');
const fs = require('fs');
const path = require('path');

async function getPublicKey() {
    const web3 = new Web3('http://127.0.0.1:7545');
    const contractJSON = JSON.parse(fs.readFileSync(path.join(__dirname, 'smart-contract', 'build', 'contracts', 'Contract.json'), 'utf-8'));
    const networkId = await web3.eth.net.getId();
    const contractAddress = contractJSON.networks[networkId].address;
    const contract = new web3.eth.Contract(contractJSON.abi, contractAddress);
    
    try {
        const publicKey = await contract.methods.getPaillierPublicKey().call();
        console.log('PUBLIC_KEY:' + publicKey);
    } catch (error) {
        console.log('PUBLIC_KEY:Not set yet');
    }
}

getPublicKey();
"@

Set-Content -Path "C:\Users\ASUS\Projects\BlockVote\temp-get-key.js" -Value $getKeyScript
$publicKeyOutput = node "C:\Users\ASUS\Projects\BlockVote\temp-get-key.js" 2>&1
Remove-Item "C:\Users\ASUS\Projects\BlockVote\temp-get-key.js" -ErrorAction SilentlyContinue

$publicKeyMatch = $publicKeyOutput | Select-String -Pattern 'PUBLIC_KEY:(.+)'
if ($publicKeyMatch) {
    $publicKey = $publicKeyMatch.Matches.Groups[1].Value
} else {
    $publicKey = "Not available"
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Network ID:        5777" -ForegroundColor White
Write-Host "Main Contract:     $contractAddress" -ForegroundColor White
Write-Host "Groth16Verifier:   $verifierAddress" -ForegroundColor White
Write-Host "" -ForegroundColor White
Write-Host "Paillier Public Key:" -ForegroundColor Yellow
if ($publicKey -and $publicKey.Length -gt 80) {
    Write-Host "   $($publicKey.Substring(0, 80))..." -ForegroundColor Cyan
    Write-Host "   (Full key stored on blockchain)" -ForegroundColor Gray
} elseif ($publicKey -and $publicKey -ne "Not available") {
    Write-Host "   $publicKey" -ForegroundColor Cyan
} else {
    Write-Host "   Public key set (view in Phase 1 output above)" -ForegroundColor Cyan
}
Write-Host "" -ForegroundColor White
Write-Host "Trustee shares saved in:" -ForegroundColor Yellow
Write-Host "   trustee_shares/" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Return to root directory
Set-Location "C:\Users\ASUS\Projects\BlockVote"