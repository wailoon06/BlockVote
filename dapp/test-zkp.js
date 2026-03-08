// Test ZKP proof generation locally (Node.js)
// Run with: node test-zkp.js

import * as snarkjs from 'snarkjs';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Web3 from 'web3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Normalize IC format
 */
function normalizeIC(ic) {
  let normalized = ic.trim().replace(/\s+/g, '');
  if (!normalized.includes('-')) {
    if (normalized.length === 12) {
      normalized = `${normalized.slice(0, 6)}-${normalized.slice(6, 8)}-${normalized.slice(8)}`;
    }
  }
  return normalized;
}

/**
 * Hash IC using web3
 */
function hashIC(ic) {
  const normalized = normalizeIC(ic);
  return Web3.utils.soliditySha3({ type: 'string', value: normalized });
}

/**
 * Generate age proof (Node.js version)
 */
async function generateAgeProof(ic, wallet) {
  try {
    console.log('[ZKP] Starting proof generation...');
    console.log('[ZKP] IC:', ic);
    console.log('[ZKP] Wallet:', wallet);
    
    // Prepare inputs
    const normalized = normalizeIC(ic);
    const icDigits = normalized.replace(/-/g, '').split('');
    const icHashField = BigInt(hashIC(ic)).toString();
    const callerField = BigInt(wallet).toString();
    
    const input = {
      ic: icDigits,
      icHash: icHashField,
      caller: callerField
    };
    
    console.log('[ZKP] Circuit inputs prepared');
    
    // Load artifacts from filesystem
    console.log('[ZKP] Loading circuit artifacts from filesystem...');
    const wasmPath = join(__dirname, 'public', 'zkp', 'agecheck.wasm');
    const zkeyPath = join(__dirname, 'public', 'zkp', 'agecheck_final.zkey');
    
    const wasmBuffer = await readFile(wasmPath);
    const zkeyBuffer = await readFile(zkeyPath);
    
    console.log('[ZKP] Generating proof (this may take 10-30 seconds)...');
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      new Uint8Array(wasmBuffer),
      zkeyBuffer
    );
    
    console.log('[ZKP] ✓ Proof generated successfully');
    
    if (publicSignals[0] !== '1') {
      throw new Error('Age verification failed: you must be 18 or older');
    }
    
    return { proof, publicSignals };
    
  } catch (error) {
    console.error('[ZKP] Proof generation failed:', error);
    throw error;
  }
}

/**
 * Format proof for Solidity
 */
async function formatProofForSolidity(proof, publicSignals) {
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const argv = JSON.parse('[' + calldata + ']');
  
  return {
    a: argv[0],
    b: argv[1],
    c: argv[2],
    input: argv[3]
  };
}

async function test() {
  try {
    console.log('=== Testing ZKP Proof Generation ===\n');
    
    // Test data (age 27, born 1999) - UPDATED: Must be 18+ years old
    const ic = "990101-01-1234"; // Born Jan 1, 1999 (age 27 in 2026) ✅
    const wallet = "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"; // Example Ganache address
    
    console.log('Input:');
    console.log('  IC:', ic);
    console.log('  Wallet:', wallet);
    console.log('\nGenerating proof...\n');
    
    const { proof, publicSignals } = await generateAgeProof(ic, wallet);
    
    console.log('✓ Proof generated successfully!\n');
    console.log('Public Signals:');
    console.log('  [0] ageOk:', publicSignals[0], '(1 = age >= 18)');
    console.log('  [1] icHash:', publicSignals[1].substring(0, 20) + '...');
    console.log('  [2] caller:', publicSignals[2].substring(0, 20) + '...');
    
    // Format for Solidity
    const formatted = await formatProofForSolidity(proof, publicSignals);
    console.log('\n✓ Formatted for Solidity call');
    console.log('\nYou can now call contract.verifyVoterWithZKP(a, b, c, input)');
    
  } catch (error) {
    console.error('✗ Test failed:', error.message);
    process.exit(1);
  }
}

test();
