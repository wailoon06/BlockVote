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
   * Encrypt a message
   * @param {number|string|bigint} plaintext - The message to encrypt
   * @returns {string} - The ciphertext as a string
   */
  encrypt(plaintext) {
    const m = BigInt(plaintext);
    
    // Generate random r where 0 < r < n
    let r;
    do {
      r = randomBigInt(this.n.toString(2).length);
    } while (r >= this.n || r === 0n);
    
    // Compute ciphertext: c = g^m * r^n mod n^2
    const gm = modPow(this.g, m, this.nSquared);
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
 * @returns {Promise<Object>} - { encrypted_vote, vote_block, encryption_method }
 */
export async function encryptVote(publicKeyN, candidateIndex, voteBlock) {
  try {
    const publicKey = new PaillierPublicKey(publicKeyN);
    const B = BigInt(voteBlock);

    // Place a single unit in the candidate's radix slot
    const plaintext = B ** BigInt(candidateIndex);

    const encryptedVote = publicKey.encrypt(plaintext);

    return {
      encrypted_vote: encryptedVote,
      vote_block: B.toString(),
      encryption_method: 'Paillier-RadixPack-JavaScript'
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
  computeVoteBlock
};
