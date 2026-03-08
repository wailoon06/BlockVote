import Web3 from 'web3';

/**
 * Normalize IC format by removing all characters except digits and dashes
 * Ensures consistent format: YYMMDD-PP-XXXX
 * @param {string} ic - IC number in any format
 * @returns {string} - Normalized IC
 */
export function normalizeIC(ic) {
  // Remove all spaces and convert to uppercase
  let normalized = ic.trim().replace(/\s+/g, '');
  
  // If no dashes, add them in correct positions (YYMMDD-PP-XXXX)
  if (!normalized.includes('-')) {
    // Format: 123456011234 -> 123456-01-1234
    if (normalized.length === 12) {
      normalized = `${normalized.slice(0, 6)}-${normalized.slice(6, 8)}-${normalized.slice(8)}`;
    }
  }
  
  return normalized;
}

/**
 * Hash IC number using keccak256 (same as Solidity)
 * @param {string} ic - IC number (e.g., "990101-01-1234")
 * @returns {string} - Hex string of the hash
 */
export function hashIC(ic) {
  const web3 = new Web3();
  const normalizedIC = normalizeIC(ic);
  // Use soliditySha3 to match Solidity's keccak256(abi.encodePacked(string))
  return web3.utils.soliditySha3({ type: 'string', value: normalizedIC });
}

/**
 * Compare OCR-extracted IC with stored IC hash
 * @param {string} ocrIC - IC extracted from OCR
 * @param {string} storedICHash - IC hash stored on blockchain
 * @returns {boolean} - True if they match
 */
export function verifyICMatch(ocrIC, storedICHash) {
  const ocrICHash = hashIC(ocrIC);
  return ocrICHash.toLowerCase() === storedICHash.toLowerCase();
}
