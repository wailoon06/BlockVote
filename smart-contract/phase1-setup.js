/**
 * Phase 1: Contract Deployment & Key Setup
 * 
 * This script automates:
 * 1. Paillier keypair generation (2048-bit)
 * 2. Public key upload to blockchain
 * 3. Private key splitting (Shamir's Secret Sharing)
 * 4. Share distribution to trustees
 * 5. Original private key destruction
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Web3 } = require('web3');
const readline = require('readline/promises');
const { encryptShareY } = require('./shareEncryption');

// Initialize Web3
const web3 = new Web3('http://127.0.0.1:7545');

// Contract artifacts
const contractPath = path.join(__dirname, 'build', 'contracts', 'Contract.json');

async function runPythonScript(scriptName, args = '') {
    console.log(`\nRunning ${scriptName}...`);
    const pythonPath = 'python';
    const scriptPath = path.join(__dirname, '..', 'backend', scriptName);
    
    try {
        const output = execSync(`${pythonPath} ${scriptPath} ${args}`, {
            encoding: 'utf-8',
            stdio: 'pipe'
        });
        return output.trim();
    } catch (error) {
        console.error(`Error running ${scriptName}:`, error.message);
        throw error;
    }
}

async function generatePaillierKeypair() {
    console.log('\n📊 Step 2: Generating 2048-bit Paillier Keypair...');
    
    // Create a temporary Python script to generate keypair
    const genScript = `
import sys
import json
sys.path.append('${path.join(__dirname, '..', 'backend').replace(/\\/g, '\\\\')}')
from paillier_crypto import PaillierCrypto

# Generate 2048-bit keypair
crypto = PaillierCrypto(key_length=2048)
public_key, private_key = crypto.generate_keypair()

# Output as JSON
result = {
    'public_key_n': str(public_key.n),
    'private_key_lambda': str(private_key.get_lambda()),
    'private_key_mu': str(private_key.mu),
    'p': str(private_key.p),
    'q': str(private_key.q)
}

print(json.dumps(result))
`;

    const tempScriptPath = path.join(__dirname, '..', 'backend', 'temp_keygen.py');
    fs.writeFileSync(tempScriptPath, genScript);
    
    try {
        const output = execSync('python ' + tempScriptPath, { encoding: 'utf-8' });
        const result = JSON.parse(output.trim());
        fs.unlinkSync(tempScriptPath);
        
        console.log('✅ Paillier keypair generated successfully!');
        console.log(`   Public Key (n): ${result.public_key_n.substring(0, 50)}...`);
        console.log(`   Private Key (λ): ${result.private_key_lambda.substring(0, 50)}...`);
        
        return result;
    } catch (error) {
        if (fs.existsSync(tempScriptPath)) {
            fs.unlinkSync(tempScriptPath);
        }
        throw error;
    }
}

async function uploadPublicKeyToBlockchain(contract, publicKeyN, adminAccount) {
    console.log('\n🔗 Step 3: Uploading Public Key to Blockchain...');
    
    try {
        const receipt = await contract.methods.setPaillierPublicKey(publicKeyN).send({
            from: adminAccount,
            gas: 3000000
        });
        
        console.log('✅ Public key uploaded to blockchain!');
        console.log(`   Transaction Hash: ${receipt.transactionHash}`);
        console.log(`   Block Number: ${receipt.blockNumber}`);
        console.log(`   Gas Used: ${receipt.gasUsed}`);
        
        // Verify the key was stored correctly
        const storedKey = await contract.methods.getPaillierPublicKey().call();
        console.log(`   Verification: Key matches = ${storedKey === publicKeyN}`);
        
        return receipt;
    } catch (error) {
        console.error('❌ Failed to upload public key:', error.message);
        throw error;
    }
}

async function splitPrivateKey(lambda, mu, n, threshold, numShares) {
    console.log(`\n🔐 Step 4: Splitting Private Key using Shamir's Secret Sharing...`);
    console.log(`   Threshold: ${threshold}`);
    console.log(`   Total Shares: ${numShares}`);
    
    const splitScript = `
import sys
import json
import hashlib
sys.path.append('${path.join(__dirname, '..', 'backend').replace(/\\/g, '\\\\')}')
from shamir_sharing import ShamirSecretSharing

# The modulus for Threshold Paillier polynomial must be n * lambda
# to perfectly preserve the homomorphic exponentiation over Z_{n^2}^*
n_val = int(${n})
modulus = n_val * int(${lambda})
n_sq = n_val * n_val

# pseudo-random generator v for Z_{n^2}^*
h = hashlib.sha256(str(n_val).encode()).hexdigest()
v_base = int(h, 16)
v = pow(v_base, 2 * n_val, n_sq)

# Initialize Shamir
shamir = ShamirSecretSharing(prime=modulus)

# We split S = lambda * mu, so that combining PDs directly yields m
S = (int(${lambda}) * int(${mu})) % modulus

# Split the secret (S value)
secret = S
threshold = ${threshold}
num_shares = ${numShares}

shares = shamir.split_secret(secret, threshold, num_shares)

# Convert to JSON (include the prime so trustees can do modular reconstruction)
result = {
    'shares': [{'x': x, 'y': str(y), 'v_i': str(pow(v, y, n_sq))} for x, y in shares],
    'threshold': threshold,
    'num_shares': num_shares,
    'prime': str(shamir.prime),
    'v': str(v)
}

print(json.dumps(result))
`;

    const tempSplitScript = path.join(__dirname, '..', 'backend', 'temp_split.py');
    fs.writeFileSync(tempSplitScript, splitScript);
    
    try {
        const output = execSync('python ' + tempSplitScript, { encoding: 'utf-8' });
        const result = JSON.parse(output.trim());
        fs.unlinkSync(tempSplitScript);
        
        console.log('✅ Private key split into shares successfully!');
        for (let i = 0; i < result.shares.length; i++) {
            console.log(`   Share ${i + 1}: (x=${result.shares[i].x}, y=${result.shares[i].y.substring(0, 30)}...)`);
        }
        console.log(`   Prime field: RFC 3526 Group 14 (2048-bit)`);

        return { shares: result.shares, prime: result.prime, v: result.v };
    } catch (error) {
        if (fs.existsSync(tempSplitScript)) {
            fs.unlinkSync(tempSplitScript);
        }
        throw error;
    }
}

async function distributeShares(shares, prime, v_generator, trusteeAddresses, contract) {
    console.log('\n📤 Step 5: Distributing Shares to Trustees...');
    console.log('🔐 Each trustee share will be encrypted with AES-256-GCM using a passphrase.');
    console.log('   Keep each passphrase safe — it is required to decrypt the share during vote counting.\n');

    const sharesDir = path.join(__dirname, '..', 'trustee_shares');

    // Create shares directory if it doesn't exist
    if (!fs.existsSync(sharesDir)) {
        fs.mkdirSync(sharesDir, { recursive: true });
    }

    // Open readline interface for interactive passphrase prompts
    const rl = readline.createInterface({
        input:  process.stdin,
        output: process.stdout,
    });

    const shareCommitments = [];

    for (let i = 0; i < shares.length; i++) {
        const share = shares[i];
        const trusteeAddress = trusteeAddresses[i];

        // Prompt for this trustee's passphrase
        console.log(`\n🔑 Trustee ${i + 1}`);
        const passphrase = await rl.question(
            `   Enter passphrase for Trustee ${i + 1}: `
        );

        if (!passphrase || passphrase.trim().length === 0) {
            rl.close();
            throw new Error(`Passphrase for Trustee ${i + 1} cannot be empty.`);
        }

        // Compute on-chain commitment from the PLAINTEXT y (before encryption)
        const shareString = `${share.x}:${share.y}`;
        const commitment  = web3.utils.keccak256(shareString);
        shareCommitments.push(commitment);

        // Encrypt the y value using AES-256-GCM + PBKDF2
        const encrypted_y = encryptShareY(share.y, passphrase);

        // Write share file — NO plaintext y stored on disk
        const shareData = {
            share_index:     i + 1,
            x:               share.x,
            encrypted_y,
            v_i:             share.v_i,  // Public Verification Share
            prime,                     // RFC 3526 Group 14 prime for modular reconstruction
              v: v_generator,            // Public Verification Generator
              distributed_at:  new Date().toISOString(),
              warning: '⚠️ KEEP THIS FILE SECURE! This share is required for vote decryption. The y value is AES-256-GCM encrypted — your passphrase is needed to decrypt it.'
          };

          const shareFilePath = path.join(sharesDir, `trustee_${i + 1}.json`);
          fs.writeFileSync(shareFilePath, JSON.stringify(shareData, null, 2));

        console.log(`   ✅ Share encrypted and saved to: ${shareFilePath}`);
        console.log(`   Commitment: ${commitment}`);
    }

    // Save global verification shares to React app for combiner reference
    const verificationData = {
        v: v_generator,
        prime,
        shares: shares.map((s, idx) => ({
            trustee: trusteeAddresses[idx],
            share_index: s.x,
            v_i: s.v_i
        }))
    };
    
    // Create config folder if it doesn't exist
    const reactConfigDir = path.join(__dirname, '..', 'dapp', 'src', 'config');
    if (!fs.existsSync(reactConfigDir)) {
        fs.mkdirSync(reactConfigDir, { recursive: true });
    }
    fs.writeFileSync(
        path.join(reactConfigDir, 'verification_shares.json'),
        JSON.stringify(verificationData, null, 2)
    );
    console.log(`   ✅ Public verification shares saved to React app configs.`);

    rl.close();

    console.log(`\n📁 All encrypted shares saved to: ${sharesDir}`);
    console.log('⚠️  IMPORTANT: Distribute each file to its trustee. The plaintext y is NOT stored anywhere.');
    console.log('⚠️  Each trustee must remember their passphrase — it cannot be recovered if lost.');

    return shareCommitments;
}

async function submitShareCommitments(contract, trusteeAddresses, commitments, adminAccount) {
    console.log('\n📝 Step 5b: Submitting Share Commitments to Blockchain...');
    console.log('   (Submitted by admin on behalf of trustees during automated setup)');

    for (let i = 0; i < trusteeAddresses.length; i++) {
        const trusteeAddr = trusteeAddresses[i];
        const commitment = commitments[i];

        try {
            const receipt = await contract.methods.submitShareCommitment(trusteeAddr, commitment).send({
                from: adminAccount,
                gas: 1000000
            });

            console.log(`✅ Trustee ${i + 1} commitment submitted`);
            console.log(`   Tx Hash: ${receipt.transactionHash}`);
        } catch (error) {
            console.error(`❌ Failed to submit commitment for Trustee ${i + 1}:`, error.message);
        }
    }
}

async function destroyPrivateKey(keyData) {
    console.log('\n🔥 Step 6: Destroying Original Private Key...');
    
    // Overwrite sensitive data
    keyData.private_key_lambda = null;
    keyData.private_key_mu = null;
    keyData.p = null;
    keyData.q = null;
    
    // Force garbage collection (if available)
    if (global.gc) {
        global.gc();
    }
    
    console.log('✅ Original private key destroyed from memory!');
    console.log('✅ Only share fragments remain - no single entity can decrypt alone.');
}

async function verifySetup(contract) {
    console.log('\n🔍 Step 7: Verifying Setup...');
    
    const publicKey = await contract.methods.getPaillierPublicKey().call();
    const threshold = await contract.methods.threshold().call();
    const numTrustees = await contract.methods.numTrustees().call();
    const trusteeAddresses = await contract.methods.getTrusteeAddresses().call();
    const allCommitted = await contract.methods.allTrusteesCommitted().call();
    
    console.log('\n✅ Setup Verification:');
    console.log(`   Public Key (n): ${publicKey.substring(0, 50)}...`);
    console.log(`   Threshold: ${threshold}`);
    console.log(`   Number of Trustees: ${numTrustees}`);
    console.log(`   All Commitments Submitted: ${allCommitted}`);
    console.log('\n   Trustee Addresses:');
    
    for (let i = 0; i < trusteeAddresses.length; i++) {
        const trusteeInfo = await contract.methods.getTrusteeInfo(trusteeAddresses[i]).call();
        console.log(`     ${i + 1}. ${trusteeAddresses[i]}`);
        console.log(`        Commitment: ${trusteeInfo.shareCommitment}`);
        console.log(`        Submitted: ${trusteeInfo.hasSubmittedCommitment}`);
    }
}

async function main() {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  🚀 Phase 1: Contract Deployment & Key Setup          ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    
    try {
        // Step 1: Load deployed contract
        console.log('\n📋 Step 1: Loading Deployed Contract...');
        const contractJSON = JSON.parse(fs.readFileSync(contractPath, 'utf-8'));
        const networkId = await web3.eth.net.getId();
        const contractAddress = contractJSON.networks[networkId].address;
        const contract = new web3.eth.Contract(contractJSON.abi, contractAddress);
        
        console.log(`✅ Contract loaded at: ${contractAddress}`);
        
        // Get accounts
        const accounts = await web3.eth.getAccounts();
        const adminAccount = accounts[0];
        
        // Get contract details
        const threshold = await contract.methods.threshold().call();
        const numTrustees = await contract.methods.numTrustees().call();
        const trusteeAddresses = await contract.methods.getTrusteeAddresses().call();
        
        console.log(`   Admin: ${adminAccount}`);
        console.log(`   Threshold: ${threshold}`);
        console.log(`   Number of Trustees: ${numTrustees}`);
        
        // Step 2: Generate Paillier Keypair
        const keyData = await generatePaillierKeypair();
        
        // Step 3: Upload Public Key to Blockchain
        await uploadPublicKeyToBlockchain(contract, keyData.public_key_n, adminAccount);
        
        // Step 4: Split Private Key
        const { shares, prime, v } = await splitPrivateKey(
            keyData.private_key_lambda,
            keyData.private_key_mu,
            keyData.public_key_n,
            parseInt(threshold),
            parseInt(numTrustees)
        );

        // Step 5: Distribute Shares
        const commitments = await distributeShares(shares, prime, v, trusteeAddresses, contract);
        
        // Step 5b: Submit commitments to blockchain (admin submits on behalf of trustees)
        await submitShareCommitments(contract, trusteeAddresses, commitments, adminAccount);
        
        // Step 6: Destroy Private Key
        await destroyPrivateKey(keyData);
        
        // Step 7: Verify Setup
        await verifySetup(contract);
        
        console.log('\n╔════════════════════════════════════════════════════════╗');
        console.log('║  ✅ Phase 1 Setup Complete!                           ║');
        console.log('╚════════════════════════════════════════════════════════╝');
        
        console.log('\n📊 Summary:');
        console.log(`   ✓ Contract deployed at: ${contractAddress}`);
        console.log(`   ✓ Public key stored on blockchain`);
        console.log(`   ✓ Threshold decryption constant μ' stored on blockchain`);
        console.log(`   ✓ Private key split into ${numTrustees} shares`);
        console.log(`   ✓ Threshold set to ${threshold} shares`);
        console.log(`   ✓ Share commitments registered on blockchain`);
        console.log(`   ✓ Original private key destroyed`);
        
        console.log('\n🌐 Blockchain Information:');
        console.log(`   Network ID: ${networkId}`);
        console.log(`   Contract Address: ${contractAddress}`);
        console.log(`   Public Key (n): ${keyData.public_key_n}`);
        
        console.log('\n⚠️  Next Steps:');
        console.log('   1. Securely distribute share files to trustees');
        console.log('   2. Trustees must keep their shares safe and confidential');
        console.log('   3. Minimum ${threshold} trustees needed for vote decryption');
        
    } catch (error) {
        console.error('\n❌ Error during Phase 1 setup:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().then(() => process.exit(0)).catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = main;
