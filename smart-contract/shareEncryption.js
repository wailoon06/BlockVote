'use strict';

/**
 * AES-256-GCM share encryption for trustee Shamir shares.
 * Uses only Node.js built-in `crypto` module — no extra npm packages needed.
 *
 * Encryption parameters (must match the browser-side Web Crypto decryption):
 *   - KDF       : PBKDF2-SHA256, 100 000 iterations, 16-byte random salt
 *   - Cipher    : AES-256-GCM, 12-byte random nonce, 128-bit auth tag
 *   - Encoding  : all byte fields are hex strings in the output JSON
 */

import crypto from 'node:crypto';

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_DIGEST     = 'sha256';
const KEY_LENGTH        = 32;   // 256-bit AES key
const SALT_LENGTH       = 16;   // 128-bit PBKDF2 salt
const NONCE_LENGTH      = 12;   // 96-bit GCM nonce (NIST recommended)

/**
 * Encrypt a Shamir share `y` value with a passphrase using AES-256-GCM.
 * A fresh random salt and nonce are generated for every call.
 *
 * @param {string} yString    Plaintext y value (large decimal integer string)
 * @param {string} passphrase Trustee passphrase (UTF-8 string)
 * @returns {{ salt: string, nonce: string, ciphertext: string, tag: string }}
 *          All values are lowercase hex-encoded strings.
 */
function encryptShareY(yString, passphrase) {
  const salt  = crypto.randomBytes(SALT_LENGTH);
  const nonce = crypto.randomBytes(NONCE_LENGTH);

  const key = crypto.pbkdf2Sync(
    passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST
  );

  const cipher     = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(yString, 'utf8'), cipher.final()]);
  const tag        = cipher.getAuthTag(); // always 16 bytes for GCM

  return {
    salt:       salt.toString('hex'),
    nonce:      nonce.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    tag:        tag.toString('hex'),
  };
}

/**
 * Decrypt a Shamir share `y` value encrypted by encryptShareY().
 * Throws a descriptive error if the passphrase is wrong or data is corrupted
 * (AES-GCM authentication tag mismatch).
 *
 * @param {{ salt: string, nonce: string, ciphertext: string, tag: string }} encrypted
 * @param {string} passphrase Trustee passphrase (UTF-8 string)
 * @returns {string} Plaintext y value
 */
function decryptShareY(encrypted, passphrase) {
  const salt       = Buffer.from(encrypted.salt,       'hex');
  const nonce      = Buffer.from(encrypted.nonce,      'hex');
  const ciphertext = Buffer.from(encrypted.ciphertext, 'hex');
  const tag        = Buffer.from(encrypted.tag,        'hex');

  const key = crypto.pbkdf2Sync(
    passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST
  );

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);

  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    throw new Error('Decryption failed — passphrase is incorrect or data is corrupted');
  }
}

export { encryptShareY, decryptShareY };
