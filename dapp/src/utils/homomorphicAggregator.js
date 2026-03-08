/**
 * Homomorphic Aggregation for Paillier Encrypted Votes (Browser)
 * 
 * Performs homomorphic addition on Paillier-encrypted votes.
 * Multiplies ciphertexts to compute the encrypted sum without decryption.
 * 
 * Paillier homomorphic property:
 *   E(m1) × E(m2) = E(m1 + m2) mod n²
 */

/**
 * Perform modular exponentiation: (base^exp) mod modulus
 * Uses BigInt for large number arithmetic
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
 * Perform modular multiplication
 */
function modMul(a, b, modulus) {
  return (BigInt(a) * BigInt(b)) % BigInt(modulus);
}

/**
 * Perform homomorphic addition on encrypted votes
 * 
 * @param {string} publicKeyN - The public key modulus N (as string)
 * @param {Array<string>} encryptedVotes - Array of encrypted votes (ciphertexts as strings)
 * @returns {string} - The encrypted sum (as string)
 */
export function performHomomorphicAddition(publicKeyN, encryptedVotes) {
  if (!publicKeyN || encryptedVotes.length === 0) {
    throw new Error('Invalid input: publicKeyN and encryptedVotes required');
  }

  // Convert to BigInt
  const n = BigInt(publicKeyN);
  const nSquared = n * n;
  
  // Start with identity element: E(0) = 1 (mod n²)
  let encryptedSum = 1n;
  
  // Multiply all ciphertexts (homomorphic addition)
  for (const encryptedVote of encryptedVotes) {
    const ciphertext = BigInt(encryptedVote);
    encryptedSum = modMul(encryptedSum, ciphertext, nSquared);
  }
  
  return encryptedSum.toString();
}

/**
 * Aggregate votes by candidate index
 * Groups votes by candidate and computes encrypted sums per candidate
 * 
 * @param {string} publicKeyN - The public key modulus N
 * @param {Array<Object>} votes - Array of vote objects with {candidateIndex, ciphertext}
 * @returns {Object} - Object mapping candidateIndex to encrypted sum
 */
export function aggregateVotesByCandidate(publicKeyN, votes) {
  // Group votes by candidate index
  const votesByCandidate = {};
  
  for (const vote of votes) {
    const idx = vote.candidateIndex;
    if (!votesByCandidate[idx]) {
      votesByCandidate[idx] = [];
    }
    votesByCandidate[idx].push(vote.ciphertext);
  }
  
  // Perform homomorphic addition for each candidate
  const encryptedTotals = {};
  
  for (const [candidateIndex, ciphertexts] of Object.entries(votesByCandidate)) {
    encryptedTotals[candidateIndex] = performHomomorphicAddition(publicKeyN, ciphertexts);
  }
  
  return encryptedTotals;
}

/**
 * Create aggregation result object
 * 
 * @param {string} encryptedTotal - The encrypted total
 * @param {number} voteCount - Number of votes aggregated
 * @returns {Object} - Result object
 */
export function createAggregationResult(encryptedTotal, voteCount) {
  return {
    encrypted_total: encryptedTotal,
    vote_count: voteCount,
    method: 'Paillier Homomorphic Addition',
    timestamp: new Date().toISOString()
  };
}

export default {
  performHomomorphicAddition,
  aggregateVotesByCandidate,
  createAggregationResult
};
