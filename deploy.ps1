# Step 1: Deploy contract
Write-Host "`n[1/3] Deploying contract to Ganache..." -ForegroundColor Yellow
Set-Location "C:\Users\ASUS\Projects\BlockVote\smart-contract"
truffle migrate --reset --network development

if ($LASTEXITCODE -ne 0) {
    Write-Host "Deployment failed!" -ForegroundColor Red
    exit 1
}

# Step 2: Copy contract file
Write-Host "`n[2/3] Copying contract file to React app..." -ForegroundColor Yellow
Copy-Item -Path "C:\Users\ASUS\Projects\BlockVote\smart-contract\build\contracts\Voter_Register.json" `
          -Destination "C:\Users\ASUS\Projects\BlockVote\dapp\src\Voter_Register.json" `
          -Force

# Verify copy
$hash1 = (Get-FileHash -Path "C:\Users\ASUS\Projects\BlockVote\smart-contract\build\contracts\Voter_Register.json" -Algorithm MD5).Hash
$hash2 = (Get-FileHash -Path "C:\Users\ASUS\Projects\BlockVote\dapp\src\Voter_Register.json" -Algorithm MD5).Hash

if ($hash1 -eq $hash2) {
    Write-Host "Contract file copied successfully!" -ForegroundColor Green
} else {
    Write-Host "File copy verification failed!" -ForegroundColor Red
    exit 1
}

# Step 3: Extract and display contract address
Write-Host "`n[3/3] Contract deployment details:" -ForegroundColor Yellow
$contractJson = Get-Content "C:\Users\ASUS\Projects\BlockVote\dapp\src\Voter_Register.json" | ConvertFrom-Json
$address = $contractJson.networks.'5777'.address
Write-Host "Contract Address: $address" -ForegroundColor Green
Write-Host "Network ID: 5777" -ForegroundColor Green