import { ZKP_CONFIG } from '../config/zkpConfig.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchArtifact(config, label) {
  const url = config.useIPFS && config.cid
    ? `${config.gateway}${config.cid}`
    : config.localPath;

  console.log(`[ZKP] Loading ${label} from:`, url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${label}: ${response.status} ${response.statusText}`);
  }
  return response.arrayBuffer();
}

async function verifyHash(arrayBuffer, config, label) {
  if (
    ZKP_CONFIG.features.verifyArtifactHashes &&
    config.sha256 &&
    config.sha256 !== 'PASTE_SHA256_HASH_HERE'
  ) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const computed = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    if (computed !== config.sha256) {
      throw new Error(
        `${label} integrity check failed!\nExpected: ${config.sha256}\nGot: ${computed}`
      );
    }
    console.log(`[ZKP] ✓ ${label} integrity verified`);
  }
}

/**
 * Compute SHA-256 hash of a file
 */
async function computeSHA256(arrayBuffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// \u2500\u2500 Legacy AgeCheck circuit (kept for backward compat) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export async function loadWasm() {
  const ab = await fetchArtifact(ZKP_CONFIG.artifacts.wasm, 'WASM');
  await verifyHash(ab, ZKP_CONFIG.artifacts.wasm, 'WASM');
  return ab;
}

export async function loadZkey() {
  const ab = await fetchArtifact(ZKP_CONFIG.artifacts.zkey, 'ZKEY');
  await verifyHash(ab, ZKP_CONFIG.artifacts.zkey, 'ZKEY');
  return new Uint8Array(ab);
}

// \u2500\u2500 VoteWithICAgeCheck circuit (used for registration & voting ZKP) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

export async function loadVoteWasm() {
  const ab = await fetchArtifact(ZKP_CONFIG.voteArtifacts.wasm, 'VoteWASM');
  await verifyHash(ab, ZKP_CONFIG.voteArtifacts.wasm, 'VoteWASM');
  return ab;
}

export async function loadVoteZkey() {
  const ab = await fetchArtifact(ZKP_CONFIG.voteArtifacts.zkey, 'VoteZKEY');
  await verifyHash(ab, ZKP_CONFIG.voteArtifacts.zkey, 'VoteZKEY');
  return new Uint8Array(ab);
}

/**
 * Verify verifier contract bytecode (optional security check)
 */
export async function verifyVerifierContract(web3) {
  if (!ZKP_CONFIG.features.verifyContractBytecode) return true;
  if (!ZKP_CONFIG.verifier.address || !ZKP_CONFIG.verifier.bytecodeHash) {
    console.warn('[ZKP] Verifier contract not configured, skipping bytecode check');
    return true;
  }
  
  try {
    const code = await web3.eth.getCode(ZKP_CONFIG.verifier.address);
    const codeHash = web3.utils.keccak256(code);
    
    if (codeHash !== ZKP_CONFIG.verifier.bytecodeHash) {
      console.error('[ZKP] Verifier bytecode mismatch!');
      return false;
    }
    
    console.log('[ZKP] ✓ Verifier contract verified');
    return true;
  } catch (error) {
    console.error('[ZKP] Failed to verify contract:', error);
    return false;
  }
}
