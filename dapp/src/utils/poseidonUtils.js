import { buildPoseidon } from 'circomlibjs';

// Singleton poseidon instance
let poseidonInstance = null;

async function getPoseidon() {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

/**
 * Compute Poseidon hash of an array of BigInt-compatible values.
 * Returns a decimal string safe for use as a circuit signal.
 * @param {Array<string|number|bigint>} inputs
 * @returns {Promise<string>} decimal string of the hash
 */
export async function poseidonHash(inputs) {
  const poseidon = await getPoseidon();
  const F = poseidon.F;
  const result = poseidon(inputs.map(v => BigInt(v)));
  return F.toObject(result).toString();
}

/**
 * Compute voter commitment: Poseidon(voterAddress, voterSecret)
 * @param {string} voterAddress - hex address e.g. "0x..."
 * @param {string} voterSecret  - decimal string secret
 * @returns {Promise<string>} decimal commitment
 */
export async function computeCommitment(voterAddress, voterSecret) {
  const addressField = BigInt(voterAddress).toString();
  return poseidonHash([addressField, voterSecret]);
}

/**
 * Compute nullifier: Poseidon(voterSecret, electionId)
 * Unique per (voter, election) — prevents double voting.
 * @param {string} voterSecret - decimal string secret
 * @param {string|number} electionId
 * @returns {Promise<string>} decimal nullifier
 */
export async function computeNullifier(voterSecret, electionId) {
  return poseidonHash([voterSecret, electionId.toString()]);
}

/**
 * Compute choice commitment: Poseidon(candidateIndex, voterSecret, electionId)
 * Binds the encrypted ballot to a specific valid candidate without revealing the choice.
 * @param {number|string} candidateIndex - 0-based index of chosen candidate
 * @param {string} voterSecret - decimal string secret
 * @param {string|number} electionId
 * @returns {Promise<string>} decimal commitment
 */
export async function computeChoiceCommitment(candidateIndex, voterSecret, electionId) {
  return poseidonHash([candidateIndex.toString(), voterSecret, electionId.toString()]);
}

/**
 * Convert decimal commitment/nullifier string to bytes32 hex for Solidity.
 * @param {string} decimalStr
 * @returns {string} "0x..." padded to 32 bytes
 */
export function toBytes32(decimalStr) {
  return '0x' + BigInt(decimalStr).toString(16).padStart(64, '0');
}

// ── Voter Secret Management ──────────────────────────────────────────────────
//
// voterSecret is encrypted with AES-256-GCM before being written to
// localStorage. The encryption key is derived from a deterministic MetaMask
// personal_sign signature so that:
//   • localStorage only ever holds ciphertext — useless without the wallet key
//   • No extra password is required from the user
//   • The secret survives browser restarts (the same signature is reproduced
//     on demand by re-signing the same fixed message)

const SECRET_KEY = (address) => `voterSecret_enc_${address.toLowerCase()}`;

// The message signed by MetaMask. Fixed and deterministic per address.
const SIGN_MESSAGE = (address) =>
  `BlockVote voter secret encryption key\nAddress: ${address.toLowerCase()}\n\nSigning this message encrypts your voter secret. It does not cost gas or submit a transaction.`;

/**
 * Derive an AES-256-GCM CryptoKey from a MetaMask personal_sign signature.
 * @param {string} walletAddress
 * @returns {Promise<CryptoKey>}
 */
async function deriveEncryptionKey(walletAddress) {
  const message = SIGN_MESSAGE(walletAddress);
  const msgHex = '0x' + Array.from(new TextEncoder().encode(message))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  const signature = await window.ethereum.request({
    method: 'personal_sign',
    params: [msgHex, walletAddress],
  });

  // SHA-256(signature bytes) → 32-byte AES key material
  const sigBytes = Uint8Array.from(
    signature.slice(2).match(/.{2}/g).map(b => parseInt(b, 16))
  );
  const keyMaterial = await window.crypto.subtle.digest('SHA-256', sigBytes);

  return window.crypto.subtle.importKey(
    'raw', keyMaterial, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']
  );
}

/**
 * Generate a cryptographically random voter secret within the BN128 field.
 * @returns {string} decimal string
 */
export function generateVoterSecret() {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  const hex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  const FIELD_ORDER = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
  const secret = BigInt('0x' + hex) % FIELD_ORDER;
  return secret.toString();
}

/**
 * Encrypt and persist voter secret in localStorage (keyed by wallet address).
 * Triggers a MetaMask personal_sign popup to derive the encryption key.
 * @param {string} walletAddress
 * @param {string} secret - decimal string
 * @returns {Promise<void>}
 */
export async function storeVoterSecret(walletAddress, secret) {
  const key = await deriveEncryptionKey(walletAddress);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(secret);
  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  const blob = {
    iv: Array.from(iv),
    ct: Array.from(new Uint8Array(ciphertext)),
  };
  localStorage.setItem(SECRET_KEY(walletAddress), JSON.stringify(blob));
}

/**
 * Retrieve and decrypt the stored voter secret for a wallet.
 * Triggers a MetaMask personal_sign popup to re-derive the decryption key.
 * Returns null if no secret is stored yet.
 * @param {string} walletAddress
 * @returns {Promise<string|null>}
 */
export async function getVoterSecret(walletAddress) {
  const raw = localStorage.getItem(SECRET_KEY(walletAddress));
  if (!raw) return null;

  let blob;
  try {
    blob = JSON.parse(raw);
  } catch {
    return null;
  }

  const key = await deriveEncryptionKey(walletAddress);
  const iv = new Uint8Array(blob.iv);
  const ct = new Uint8Array(blob.ct);

  try {
    const plaintext = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(plaintext);
  } catch {
    // Wrong key or corrupted blob — treat as missing
    return null;
  }
}

/**
 * Check whether an encrypted voter secret blob exists for this wallet.
 * Synchronous — does NOT decrypt or trigger MetaMask.
 * @param {string} walletAddress
 * @returns {boolean}
 */
export function hasVoterSecret(walletAddress) {
  return !!localStorage.getItem(SECRET_KEY(walletAddress));
}
