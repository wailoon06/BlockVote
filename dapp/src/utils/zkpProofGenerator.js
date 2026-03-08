import * as snarkjs from 'snarkjs';
import { loadWasm, loadZkey, loadVoteWasm, loadVoteZkey } from './zkpArtifactLoader.js';
import { normalizeIC, hashIC } from './icHashUtils.js';
import { computeCommitment, computeNullifier, computeChoiceCommitment, toBytes32 } from './poseidonUtils.js';

/**
 * Convert IC string to digit array
 * @param {string} ic - IC like "990101-01-1234"
 * @returns {string[]} - Array like ["9","9","0","1","0","1","0","1","1","2","3","4"]
 */
function icToDigitArray(ic) {
  const normalized = normalizeIC(ic);
  const digits = normalized.replace(/-/g, ''); // Remove dashes
  
  if (digits.length !== 12) {
    throw new Error(`Invalid IC format: expected 12 digits, got ${digits.length}`);
  }
  
  return digits.split('');
}

/**
 * Convert Ethereum address to field element (decimal string)
 * @param {string} address - Ethereum address like "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
 * @returns {string} - Decimal string
 */
function addressToFieldElement(address) {
  return BigInt(address).toString();
}

/**
 * Convert keccak256 hash to field element (decimal string)
 * @param {string} hash - Hex hash like "0x1a2b3c..."
 * @returns {string} - Decimal string
 */
function hashToFieldElement(hash) {
  return BigInt(hash).toString();
}

/**
 * Generate ZK proof for age verification
 * @param {string} ic - IC number like "990101-01-1234"
 * @param {string} walletAddress - Ethereum address
 * @returns {Promise<{proof, publicSignals}>} - Proof and public signals
 */
export async function generateAgeProof(ic, walletAddress) {
  console.log('[ZKP] Starting proof generation...');
  console.log('[ZKP] IC:', ic);
  console.log('[ZKP] Wallet:', walletAddress);
  
  try {
    // Step 1: Prepare inputs
    const icDigits = icToDigitArray(ic);
    const icHashHex = hashIC(ic);
    const icHashField = hashToFieldElement(icHashHex);
    const callerField = addressToFieldElement(walletAddress);
    
    const input = {
      ic: icDigits,
      icHash: icHashField,
      caller: callerField
    };
    
    console.log('[ZKP] Circuit inputs prepared:', {
      ic: icDigits.join(''),
      icHash: icHashField.substring(0, 20) + '...',
      caller: callerField.substring(0, 20) + '...'
    });
    
    // Step 2: Load artifacts
    console.log('[ZKP] Loading circuit artifacts...');
    const wasmBuffer = await loadWasm();
    const zkeyBuffer = await loadZkey();
    
    // Step 3: Generate proof
    console.log('[ZKP] Generating proof (this may take 10-30 seconds)...');
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      new Uint8Array(wasmBuffer),
      zkeyBuffer
    );
    
    console.log('[ZKP] ✓ Proof generated successfully');
    console.log('[ZKP] Public signals:', publicSignals);
    
    // Verify publicSignals structure
    if (publicSignals.length !== 3) {
      throw new Error(`Expected 3 public signals, got ${publicSignals.length}`);
    }
    
    const [ageOk, icHashOut, callerOut] = publicSignals;
    
    if (ageOk !== '1') {
      throw new Error('Age verification failed: ageOk is not 1 (you must be 18 or older)');
    }
    
    console.log('[ZKP] Age check: PASSED (age >= 18)');
    
    return { proof, publicSignals };
    
  } catch (error) {
    console.error('[ZKP] Proof generation failed:', error);
    
    // Provide user-friendly error messages
    if (error.message?.includes('Assert Failed')) {
      throw new Error('You must be at least 18 years old to complete verification.');
    } else if (error.message?.includes('integrity check failed')) {
      throw new Error('Security check failed: Circuit artifacts may have been tampered with.');
    } else {
      throw new Error(`Proof generation failed: ${error.message}`);
    }
  }
}

/**
 * Format proof for Solidity contract call
 * @param {object} proof - Proof from snarkjs
 * @param {array} publicSignals - Public signals array
 * @returns {object} - {a, b, c, input} formatted for Solidity
 */
export async function formatProofForSolidity(proof, publicSignals) {
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const argv = JSON.parse('[' + calldata + ']');
  
  return {
    a: argv[0],
    b: argv[1],
    c: argv[2],
    input: argv[3]
  };
}

// ── VoteWithICAgeCheck circuit helpers ───────────────────────────────────────

/**
 * Build the circuit input object for regCheck.
 * Used by both generateRegistrationProof and generateVoteProof.
 *
 * @param {string}        ic              - IC number e.g. "990101-01-1234"
 * @param {string}        walletAddress   - voter's Ethereum address
 * @param {string}        voterSecret     - decimal string secret from localStorage
 * @param {string|number} electionId      - target election (0 = registration)
 * @param {number}        candidateIndex  - 0-based chosen candidate (0 for registration)
 * @param {number}        numCandidates   - total approved candidates (1 for registration)
 */
async function buildVoteCircuitInput(ic, walletAddress, voterSecret, electionId, candidateIndex = 0, numCandidates = 1) {
  const icDigits = icToDigitArray(ic);               // private
  const addressField = addressToFieldElement(walletAddress); // private

  // Use UTC date to match block.timestamp (which is always UTC)
  const now = new Date();
  const currentYear  = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const currentDay   = now.getUTCDate();

  const commitment       = await computeCommitment(walletAddress, voterSecret);                     // public
  const nullifier        = await computeNullifier(voterSecret, electionId);                         // public
  const choiceCommitment = await computeChoiceCommitment(candidateIndex, voterSecret, electionId);  // public (NEW)

  return {
    // ── private ──────────────────────────────
    ic:             icDigits,
    voterSecret:    voterSecret,
    voterAddress:   addressField,
    candidateIndex: candidateIndex.toString(),   // NEW
    // ── public ───────────────────────────────
    ageThreshold:     '18',
    nullifierHash:    nullifier,
    electionId:       electionId.toString(),
    voterCommitment:  commitment,
    currentYear:      currentYear.toString(),
    currentMonth:     currentMonth.toString(),
    currentDay:       currentDay.toString(),
    numCandidates:    numCandidates.toString(),  // NEW
    choiceCommitment: choiceCommitment,          // NEW
  };
}

/**
 * Pre-flight validation: compute age from IC and throw a friendly error
 * before spending 30 s generating a proof that will definitely fail.
 *
 * Malaysian IC format: YYMMDD-PB-XXXX  (12 digits, dashes optional)
 * Year disambiguation: YY <= 26 → 20YY, else → 19YY  (same rule as circuit)
 */
function validateICAge(ic) {
  const normalized = ic.replace(/-/g, '');
  if (!/^\d{12}$/.test(normalized)) {
    throw new Error('Invalid IC format: must be 12 digits (e.g. 990101-01-1234).');
  }

  const yy = parseInt(normalized.substring(0, 2), 10);
  const mm = parseInt(normalized.substring(2, 4), 10);
  const dd = parseInt(normalized.substring(4, 6), 10);

  if (mm < 1 || mm > 12) throw new Error(`Invalid IC: month ${mm} is out of range (01-12).`);
  if (dd < 1 || dd > 31) throw new Error(`Invalid IC: day ${dd} is out of range (01-31).`);

  const fullYear = yy <= 26 ? 2000 + yy : 1900 + yy;

  // Mirror the circuit's YYYYMMDD numeric comparison
  const now = new Date();
  const birthInt  = fullYear * 10000 + mm * 100 + dd;
  const todayInt  = now.getUTCFullYear() * 10000 + (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  const age = Math.floor((todayInt - birthInt) / 10000);

  if (age < 18) {
    throw new Error(
      `Age verification failed: you must be at least 18 years old. ` +
      `Your IC indicates you are ${age > 0 ? age : 0} year(s) old.`
    );
  }
}

/**
 * Translate a raw snarkjs / circuit error into a human-readable message.
 */
function friendlyProofError(error) {
  const msg = error?.message ?? String(error);
  if (msg.includes('Assert Failed') || msg.includes('assert')) {
    // Try to give a specific reason
    if (msg.includes('month') || msg.includes('mm')) return new Error('Proof failed: IC month is invalid (must be 01-12).');
    if (msg.includes('day')   || msg.includes('dd')) return new Error('Proof failed: IC day is invalid (must be 01-31).');
    if (msg.includes('age'))                         return new Error('Proof failed: you must be at least 18 years old.');
    if (msg.includes('digit'))                       return new Error('Proof failed: IC contains a non-numeric character.');
    // Generic assert — most likely age
    return new Error('Proof failed: one or more circuit constraints were not satisfied. Check that your IC is correct and you are at least 18 years old.');
  }
  if (msg.includes('integrity check failed') || msg.includes('zkey')) {
    return new Error('Security check failed: ZKP circuit files may be corrupted. Please contact support.');
  }
  if (msg.includes('fetch') || msg.includes('network')) {
    return new Error('Failed to load ZKP circuit files. Check your internet connection and try again.');
  }
  return new Error(`Proof generation failed: ${msg}`);
}


 /*
 * @param {string} ic           - IC number e.g. "990101-01-1234"
 * @param {string} walletAddress - voter's Ethereum address
 * @param {string} voterSecret  - generated secret (stored in localStorage)
 * @returns {Promise<{proof, publicSignals, commitmentHex, nullifierHex}>}
 */
export async function generateRegistrationProof(ic, walletAddress, voterSecret) {
  console.log('[ZKP] Generating registration proof (regCheck, electionId=0)...');

  // Fast pre-flight check — fails immediately with a friendly message if age < 18
  validateICAge(ic);

  // Registration uses candidateIndex=0, numCandidates=1 (dummy values — circuit still satisfied)
  const REGISTRATION_ELECTION_ID = 0;
  const input = await buildVoteCircuitInput(ic, walletAddress, voterSecret, REGISTRATION_ELECTION_ID, 0, 1);

  console.log('[ZKP] Loading vote circuit artifacts...');
  const wasmBuffer = await loadVoteWasm();
  const zkeyBuffer = await loadVoteZkey();

  console.log('[ZKP] Generating proof (may take 10–30 s)...');
  let proof, publicSignals;
  try {
    ({ proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      new Uint8Array(wasmBuffer),
      zkeyBuffer
    ));
  } catch (err) {
    throw friendlyProofError(err);
  }

  console.log('[ZKP] ✓ Registration proof generated');
  console.log('[ZKP] Public signals:', publicSignals);

  // Format for Solidity call (same as generateVoteProof)
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const argv = JSON.parse('[' + calldata + ']');

  return {
    proof,
    publicSignals,
    pA:            argv[0],           // uint[2]
    pB:            argv[1],           // uint[2][2]
    pC:            argv[2],           // uint[2]
    pubSignals:    argv[3],           // uint[9]
    commitmentHex: toBytes32(publicSignals[3]),  // voterCommitment  [3]
    nullifierHex:  toBytes32(publicSignals[1]),  // nullifierHash    [1]
    // choiceCommitment not used on-chain at registration (dummy)
  };
}

/**
 * Generate ZKP proof for CASTING A VOTE (VoterElections.js).
 *
 * @param {string}        ic              - IC number e.g. "990101-01-1234"
 * @param {string}        walletAddress   - voter's Ethereum address
 * @param {string}        voterSecret     - stored secret from localStorage
 * @param {string|number} electionId      - the election being voted in
 * @param {number}        candidateIndex  - 0-based index of chosen candidate
 * @param {number}        numCandidates   - total approved candidates in the election
 * @returns {Promise<{proof, publicSignals, pA, pB, pC, pubSignals, nullifierHex, choiceCommitmentHex}>}
 */
export async function generateVoteProof(ic, walletAddress, voterSecret, electionId, candidateIndex, numCandidates) {
  console.log('[ZKP] Generating vote proof (regCheck, electionId=' + electionId + ', candidateIndex=' + candidateIndex + ')...');

  if (candidateIndex === undefined || candidateIndex === null) {
    throw new Error('candidateIndex is required for vote proof generation.');
  }
  if (!numCandidates || numCandidates < 1) {
    throw new Error('numCandidates must be >= 1 for vote proof generation.');
  }

  // Fast pre-flight check
  validateICAge(ic);

  const input = await buildVoteCircuitInput(ic, walletAddress, voterSecret, electionId, candidateIndex, numCandidates);

  console.log('[ZKP] Loading vote circuit artifacts...');
  const wasmBuffer = await loadVoteWasm();
  const zkeyBuffer = await loadVoteZkey();

  console.log('[ZKP] Generating proof (may take 10–30 s)...');
  let proof, publicSignals;
  try {
    ({ proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      new Uint8Array(wasmBuffer),
      zkeyBuffer
    ));
  } catch (err) {
    throw friendlyProofError(err);
  }

  console.log('[ZKP] ✓ Vote proof generated');
  console.log('[ZKP] Public signals:', publicSignals);

  // Format for Solidity call
  const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
  const argv = JSON.parse('[' + calldata + ']');

  return {
    proof,
    publicSignals,
    pA:                 argv[0],           // uint[2]
    pB:                 argv[1],           // uint[2][2]
    pC:                 argv[2],           // uint[2]
    pubSignals:         argv[3],           // uint[9]
    nullifierHex:       toBytes32(publicSignals[1]),  // [1] nullifierHash
    choiceCommitmentHex: toBytes32(publicSignals[8]), // [8] choiceCommitment (NEW)
  };
}
