/**
 * Paillier Encryption Utility for Vote Encryption
 * 
 * This implements Paillier encryption in JavaScript for client-side vote encryption.
 * The encryption is homomorphic, allowing vote tallying without decryption.
 */

/**
 * Modular exponentiation: (base^exp) mod modulus
 * Uses binary exponentiation for efficiency
 */
function modPow(base, exp, modulus) {
  if (modulus === 1n) return 0n;
  
  let result = 1n;
  base = base % modulus;
  
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % modulus;
    }
    exp = exp >> 1n;
    base = (base * base) % modulus;
  }
  
  return result;
}

/**
 * Extended Euclidean Algorithm
 */
function gcdExtended(a, b) {
  let x = 0n, y = 1n, u = 1n, v = 0n;
  while (a !== 0n) {
    let q = b / a;
    let r = b % a;
    let m = x - u * q;
    let n = y - v * q;
    b = a; a = r; x = u; y = v; u = m; v = n;
  }
  return [b, x, y];
}

/**
 * Modular Inverse
 */
function modInverse(a, m) {
  let [g, x, y] = gcdExtended(a, m);
  if (g !== 1n) throw new Error("No inverse");
  return (x % m + m) % m;
}

/**
 * SHA-256 async helper
 */
async function sha256Hex(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate CDS Disjunctive "OR" Proof for Paillier Radix Election
 */
export async function generateCDSProof(nStr, cStr, rStr, c_index, valid_m_array) {
  const n = BigInt(nStr);
  const c = BigInt(cStr);
  const r = BigInt(rStr);
  const n_squared = n * n;
  
  const k = valid_m_array.length;
  const u = [];
  for (let i = 0; i < k; i++) {
    let m_i = BigInt(valid_m_array[i]);
    let g_inv_m = (1n - m_i * n) % n_squared;
    if (g_inv_m < 0n) g_inv_m += n_squared;
    u.push((c * g_inv_m) % n_squared);
  }
  
  const a = new Array(k);
  const e = new Array(k);
  const z = new Array(k);
  
  const w = randomBigInt(n.toString(2).length - 1);
  a[c_index] = modPow(w, n, n_squared);
  
  for (let i = 0; i < k; i++) {
    if (i === c_index) continue;
    e[i] = randomBigInt(256);
    z[i] = randomBigInt(n.toString(2).length - 1);
    const u_inv = modInverse(u[i], n_squared);
    const z_n = modPow(z[i], n, n_squared);
    const u_inv_e = modPow(u_inv, e[i], n_squared);
    a[i] = (z_n * u_inv_e) % n_squared;
  }
  
  let hash_input = n.toString() + "," + c.toString();
  for (let i = 0; i < k; i++) {
    hash_input += "," + a[i].toString();
  }
  
  const E_hex = await sha256Hex(hash_input);
  const E = BigInt("0x" + E_hex);
  
  let sum_e_fake = 0n;
  for (let i = 0; i < k; i++) {
    if (i !== c_index) sum_e_fake += e[i];
  }
  
  const Q = 1n << 256n;
  let e_c = (E - sum_e_fake) % Q;
  if (e_c < 0n) e_c += Q;
  e[c_index] = e_c;
  
  const r_pow_e = modPow(r, e[c_index], n);
  z[c_index] = (w * r_pow_e) % n;
  
  return {
    e: e.map(x => x.toString()),
    z: z.map(x => x.toString()),
    a: a.map(x => x.toString())
  };
}

/**
 * Verify CDS Disjunctive "OR" Proof
 */
export async function verifyCDSProof(nStr, cStr, proof, valid_m_array) {
  try {
    const n = BigInt(nStr);
    const c = BigInt(cStr);
    const n_squared = n * n;
    const k = valid_m_array.length;
    
    if (!proof || !proof.e || !proof.z || !proof.a || proof.e.length !== k || proof.z.length !== k || proof.a.length !== k) {
      return false;
    }
    
    const e = proof.e.map(BigInt);
    const z = proof.z.map(BigInt);
    const a = proof.a.map(BigInt);
    
    let hash_input = n.toString() + "," + c.toString();
    for (let i = 0; i < k; i++) {
      hash_input += "," + a[i].toString();
    }
    const E_hex = await sha256Hex(hash_input);
    const E = BigInt("0x" + E_hex);
    
    let sum_e = 0n;
    for (let i = 0; i < k; i++) {
      sum_e += e[i];
    }
    const Q = 1n << 256n;
    
    if ((sum_e % Q) !== (E % Q)) {
      return false;
    }
    
    for (let i = 0; i < k; i++) {
      let m_i = BigInt(valid_m_array[i]);
      let g_inv_m = (1n - m_i * n) % n_squared;
      if (g_inv_m < 0n) g_inv_m += n_squared;
      const u_i = (c * g_inv_m) % n_squared;
      
      const lhs = modPow(z[i], n, n_squared);
      const rhs = (a[i] * modPow(u_i, e[i], n_squared)) % n_squared;
      
      if (lhs !== rhs) return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Generate a random BigInt with specified number of bits
 */
function randomBigInt(bits) {
  const bytes = Math.ceil(bits / 8);
  const randomBytes = new Uint8Array(bytes);
  crypto.getRandomValues(randomBytes);
  
  let result = 0n;
  for (let i = 0; i < bytes; i++) {
    result = (result << 8n) | BigInt(randomBytes[i]);
  }
  
  // Mask to get exact number of bits
  const mask = (1n << BigInt(bits)) - 1n;
  return result & mask;
}

/**
 * Paillier Public Key
 */
class PaillierPublicKey {
  constructor(n) {
    this.n = BigInt(n);
    this.nSquared = this.n * this.n;
    this.g = this.n + 1n; // Generator (simplified)
  }
  
  /**
   * Encrypt a message returning the ciphertext and randomness
   */
  encryptWithR(plaintext) {
    const m = BigInt(plaintext);

    // Generate random r where 0 < r < n and gcd(r, n) == 1
    let r;
    do {
      r = randomBigInt(this.n.toString(2).length);
    } while (r >= this.n || r === 0n || gcdExtended(r, this.n)[0] !== 1n);

    // Compute ciphertext: c = g^m * r^n mod n^2
    // optimized gm = (1 + m * n) mod n^2 since g = n + 1
    const gm = (1n + (m * this.n)) % this.nSquared;
    const rn = modPow(r, this.n, this.nSquared);
    const ciphertext = (gm * rn) % this.nSquared;

    return { ciphertext: ciphertext.toString(), r: r.toString() };
  }

  /**
   * Encrypt a message
   * @param {number|string|bigint} plaintext - The message to encrypt
   * @returns {string} - The ciphertext as a string
   */
  encrypt(plaintext) {
    const m = BigInt(plaintext);
    
    // Generate random r where 0 < r < n and gcd(r, n) == 1
    let r;
    do {
      r = randomBigInt(this.n.toString(2).length);
    } while (r >= this.n || r === 0n || gcdExtended(r, this.n)[0] !== 1n);
    
    // Compute ciphertext: c = g^m * r^n mod n^2
    // optimized gm = (1 + m * n) mod n^2 since g = n + 1
    const gm = (1n + (m * this.n)) % this.nSquared;
    const rn = modPow(r, this.n, this.nSquared);
    const ciphertext = (gm * rn) % this.nSquared;
    
    return ciphertext.toString();
  }
}

// ─── Scheme constants ────────────────────────────────────────────────────────
//
//  Radix / slot packing scheme:
//
//    plaintext = B ^ candidateIndex        (one unit in the chosen slot)
//
//  Base B is chosen dynamically as the smallest power of 10 strictly greater
//  than the total number of registered voters.  This prevents carry-bleed
//  between adjacent slots (a slot can accumulate at most totalVoters counts,
//  which is always < B) while using the minimum number of digits per slot —
//  leaving more room for candidates within the 1024-bit modulus.
//
//  After homomorphic aggregation of V votes:
//    msum   = sum of all plaintexts  (one single decryption)
//    count[i] = floor(msum / B^i) mod B
//
//  No voter identity is embedded — auditability is provided by the
//  on-chain EncryptedVoteCast event which links voter address → IPFS CID.
//
//  1024-bit Paillier key: n ≈ 10^309.  Max candidates per ciphertext:
//    floor(309 / digits(B))
//  Examples:
//    100  voters  → B = 10^3  → up to 103 candidates
//    10k  voters  → B = 10^5  → up to  61 candidates
//    1M   voters  → B = 10^7  → up to  44 candidates
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the slot base B for the given total voter count.
 *
 * Returns the smallest power of 10 strictly greater than totalVoters,
 * with a minimum of 10^3 = 1000 (handles up to 999 voters per slot safely).
 *
 * @param {number|bigint} totalVoters - Total registered voters for the election
 * @returns {bigint} B as a BigInt
 */
export function computeVoteBlock(totalVoters) {
  const n = Number(totalVoters);
  const digits = Math.max(3, Math.floor(Math.log10(n + 1)) + 1);
  return 10n ** BigInt(digits);
}

/**
 * Encrypt a vote using radix slot packing.
 *
 *   plaintext = voteBlock ^ candidateIndex
 *
 * The single resulting ciphertext is uploaded to IPFS.
 * The candidate choice is hidden inside the encrypted integer.
 * Voter identity is NOT embedded — it is tracked via the blockchain event log.
 *
 * @param {string}        publicKeyN     - Paillier public key (n) as a decimal string
 * @param {number}        candidateIndex - 0-based index of the chosen candidate
 * @param {bigint|string} voteBlock      - Slot base B (from computeVoteBlock)
 * @param {number}        numCandidates  - Number of valid candidate options to construct the proof
 * @returns {Promise<Object>} - { encrypted_vote, vote_block, encryption_method, paillier_zkp }
 */
export async function encryptVote(publicKeyN, candidateIndex, voteBlock, numCandidates = 1) {
  try {
    const startTime = performance.now();
    const publicKey = new PaillierPublicKey(publicKeyN);
    const B = BigInt(voteBlock);

    // Place a single unit in the candidate's radix slot
    const plaintext = B ** BigInt(candidateIndex);

    const { ciphertext: encryptedVote, r } = publicKey.encryptWithR(plaintext);
    
    // Generate valid plaintext set for the ZKP
    const validPlaintexts = [];
    for (let i = 0; i < numCandidates; i++) {
      validPlaintexts.push(B ** BigInt(i));
    }
    
    // Generate CDS proof of well-formedness
    const paillier_zkp = await generateCDSProof(publicKeyN, encryptedVote, r, candidateIndex, validPlaintexts);

    const endTime = performance.now();
    console.log(`[Voting] Paillier Encryption Time: ${(endTime - startTime).toFixed(2)} ms`);

    return {
      encrypted_vote: encryptedVote,
      vote_block: B.toString(),
      encryption_method: 'Paillier-RadixPack-JavaScript',
      paillier_zkp: paillier_zkp
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error(`Failed to encrypt vote: ${error.message}`);
  }
}

/**
 * Get the public key from the blockchain
 * @param {Object} contract - The deployed contract instance
 * @returns {Promise<string>} - The public key (n) as a string
 */
export async function getPublicKey(contract) {
  try {
    const publicKeyN = await contract.methods.getPaillierPublicKey().call();
    const isPaillierKeySet = await contract.methods.isPaillierKeySet().call();
    
    if (!isPaillierKeySet) {
      throw new Error('Paillier public key not set. Please run Phase 1 setup first.');
    }
    
    return publicKeyN;
  } catch (error) {
    console.error('Error fetching public key:', error);
    throw new Error(`Failed to fetch public key: ${error.message}`);
  }
}

/**
 * Map candidate address to index
 * @param {Array} candidates - Array of candidate addresses
 * @param {string} candidateAddress - The selected candidate's address
 * @returns {number} - The candidate index (0-based)
 */
export function getCandidateIndex(candidates, candidateAddress) {
  const index = candidates.findIndex(
    c => c.address && c.address.toLowerCase() === candidateAddress.toLowerCase()
  );
  
  if (index === -1) {
    throw new Error('Candidate not found');
  }
  
  return index;
}

export default {
  encryptVote,
  getPublicKey,
  getCandidateIndex,
  computeVoteBlock,
  generateCDSProof,
  verifyCDSProof
};
