/**
 * Combiner Crypto Utility — Phase 5 (Combiner Tally Committee)
 *
 * Provides:
 *  - Per-election ephemeral ECDH P-256 session key pair generation / storage
 *  - ECIES encrypt/decrypt (ephemeral ECDH P-256 + HKDF-SHA256 + AES-256-GCM)
 *  - Session private key encrypted storage in localStorage (MetaMask-derived AES key)
 *
 * Security notes:
 *  - Private keys are *never* stored in plaintext; always encrypted with AES-GCM
 *    whose key is derived from a deterministic MetaMask personal_sign signature.
 *  - ECIES ciphertexts include an ephemeral public key + IV + AES-GCM tag.
 *  - λ values are never stored or logged; callers must wipe them immediately.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(buf) {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Session Key Storage (MetaMask-encrypted localStorage) ────────────────────

const SESSION_KEY_STORAGE = (addr, electionId) =>
  `combinerSession_enc_${addr.toLowerCase()}_${electionId}`;

const COMBINER_SIGN_MESSAGE = (address, electionId) =>
  `BlockVote combiner session key\nAddress: ${address.toLowerCase()}\nElection: ${electionId}\n\nSigning this message protects your combiner session key. No gas cost.`;

async function deriveCombinerEncKey(walletAddress, electionId) {
  const message = COMBINER_SIGN_MESSAGE(walletAddress, electionId);
  const msgHex =
    '0x' +
    Array.from(new TextEncoder().encode(message))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

  const signature = await window.ethereum.request({
    method: 'personal_sign',
    params: [msgHex, walletAddress],
  });

  const sigBytes = Uint8Array.from(
    signature.slice(2).match(/.{2}/g).map(b => parseInt(b, 16))
  );
  const keyMaterial = await window.crypto.subtle.digest('SHA-256', sigBytes);

  return window.crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

// ── Key Pair Generation / Export ─────────────────────────────────────────────

/**
 * Generate a fresh ephemeral ECDH P-256 key pair for one election.
 * @returns {Promise<{privateKey: CryptoKey, publicKey: CryptoKey}>}
 */
export async function generateSessionKeyPair() {
  return window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, // extractable (needed to export JWK for storage and raw bytes for on-chain)
    ['deriveBits']
  );
}

/**
 * Export the public key as an uncompressed 65-byte hex string.
 * This is what gets registered on-chain.
 * @param {CryptoKey} pubKey
 * @returns {Promise<string>} "04..." hex
 */
export async function exportPubKeyHex(pubKey) {
  const raw = await window.crypto.subtle.exportKey('raw', pubKey);
  return bytesToHex(new Uint8Array(raw));
}

/**
 * Import an uncompressed hex public key back into a CryptoKey.
 * @param {string} hex  "04..." hex from on-chain
 * @returns {Promise<CryptoKey>}
 */
export async function importPubKeyHex(hex) {
  const raw = hexToBytes(hex);
  return window.crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [] // public keys have no usage in WebCrypto
  );
}

// ── Session Key Persistence ───────────────────────────────────────────────────

/**
 * Encrypt and persist the session private key in localStorage.
 * Triggers a MetaMask personal_sign popup to derive the encryption key.
 * @param {string}    walletAddress
 * @param {number}    electionId
 * @param {CryptoKey} privKey  Extractable ECDH P-256 private key
 * @returns {Promise<void>}
 */
export async function storeSessionPrivKey(walletAddress, electionId, privKey) {
  const jwk = await window.crypto.subtle.exportKey('jwk', privKey);
  const plaintext = new TextEncoder().encode(JSON.stringify(jwk));

  const encKey = await deriveCombinerEncKey(walletAddress, Number(electionId));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encKey,
    plaintext
  );

  const blob = { iv: Array.from(iv), ct: Array.from(new Uint8Array(ciphertext)) };
  localStorage.setItem(
    SESSION_KEY_STORAGE(walletAddress, electionId),
    JSON.stringify(blob)
  );
}

/**
 * Load, decrypt, and return the stored session private key.
 * Triggers a MetaMask personal_sign popup to re-derive the decryption key.
 * Returns null if no key is stored for this election.
 * @param {string} walletAddress
 * @param {number} electionId
 * @returns {Promise<CryptoKey|null>}
 */
export async function loadSessionPrivKey(walletAddress, electionId) {
  const raw = localStorage.getItem(SESSION_KEY_STORAGE(walletAddress, electionId));
  if (!raw) return null;

  let blob;
  try {
    blob = JSON.parse(raw);
  } catch {
    return null;
  }

  const encKey = await deriveCombinerEncKey(walletAddress, Number(electionId));
  const iv = new Uint8Array(blob.iv);
  const ct = new Uint8Array(blob.ct);

  try {
    const plaintextBuf = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      encKey,
      ct
    );
    const jwk = JSON.parse(new TextDecoder().decode(plaintextBuf));
    return window.crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
  } catch {
    return null;
  }
}

/**
 * Check whether a session key has been stored for this election (synchronous).
 * Does NOT decrypt or trigger MetaMask.
 * @param {string} walletAddress
 * @param {number} electionId
 * @returns {boolean}
 */
export function hasStoredSessionKey(walletAddress, electionId) {
  return localStorage.getItem(SESSION_KEY_STORAGE(walletAddress, electionId)) !== null;
}

// ── ECIES Encrypt / Decrypt ───────────────────────────────────────────────────
//
// Scheme: Ephemeral ECDH P-256 + HKDF-SHA256 (no salt, info="BlockVote ECIES") + AES-256-GCM
//
// Ciphertext payload shape:
//   { ephemeralPub: "04...", iv: "...", ciphertext: "..." }
// all hex-encoded strings.  The AES-GCM auth tag is appended to the ciphertext
// by WebCrypto automatically (last 16 bytes).

const ECIES_INFO = new TextEncoder().encode('BlockVote ECIES');

async function deriveEciesAesKey(localPrivKey, remotePubKey, usage) {
  // 1. ECDH shared bits (256 bits)
  const sharedBits = await window.crypto.subtle.deriveBits(
    { name: 'ECDH', public: remotePubKey },
    localPrivKey,
    256
  );

  // 2. Import as HKDF key material
  const hkdfKey = await window.crypto.subtle.importKey(
    'raw',
    sharedBits,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  );

  // 3. Derive AES-256-GCM key via HKDF-SHA256
  return window.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: ECIES_INFO,
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
}

/**
 * ECIES-encrypt a plaintext string for the holder of `recipientPubHex`.
 * @param {string} recipientPubHex  Uncompressed P-256 public key hex ("04...")
 * @param {string} plaintextString
 * @returns {Promise<{ephemeralPub: string, iv: string, ciphertext: string}>}
 */
export async function eciesEncrypt(recipientPubHex, plaintextString) {
  // Generate ephemeral key pair
  const ephemeral = await window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  const ephemeralPubRaw = await window.crypto.subtle.exportKey(
    'raw',
    ephemeral.publicKey
  );
  const ephemeralPubHex = bytesToHex(new Uint8Array(ephemeralPubRaw));

  // Import recipient public key
  const recipientPubKey = await importPubKeyHex(recipientPubHex);

  // Derive AES key
  const aesKey = await deriveEciesAesKey(ephemeral.privateKey, recipientPubKey, 'encrypt');

  // Encrypt
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintextString);
  const cipherBuf = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoded
  );

  return {
    ephemeralPub: ephemeralPubHex,
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(cipherBuf)),
  };
}

/**
 * ECIES-decrypt a payload originally produced by eciesEncrypt().
 * @param {CryptoKey} privKey  Recipient's session private key (ECDH P-256)
 * @param {{ ephemeralPub: string, iv: string, ciphertext: string }} payload
 * @returns {Promise<string>} decrypted plaintext string
 */
export async function eciesDecrypt(privKey, payload) {
  const { ephemeralPub, iv, ciphertext } = payload;

  // Import the sender's ephemeral public key
  const ephemeralPubKey = await importPubKeyHex(ephemeralPub);

  // Derive AES key using recipient's private key + sender's ephemeral public key
  const aesKey = await deriveEciesAesKey(privKey, ephemeralPubKey, 'decrypt');

  // Decrypt (AES-GCM auth tag is embedded in the last 16 bytes by WebCrypto)
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: hexToBytes(iv) },
    aesKey,
    hexToBytes(ciphertext)
  );

  return new TextDecoder().decode(decrypted);
}
