/**
 * Web Worker: computePartialU
 *
 * Runs the heavy modular exponentiation U_j = C^{lambda_j} mod n²
 * off the main thread so the browser UI stays responsive.
 *
 * Receives:  { ciphertext: string, lambdaJ: string, publicKeyN: string }
 * Posts back: { Uj: string }  — or  { error: string }  on failure
 *
 * All inputs are decimal strings because BigInt cannot be transferred
 * via structured clone directly in all environments.
 */

/* eslint-disable no-restricted-globals */

// Inline modPow — cannot import from the main bundle in a classic worker.
function modPow(base, exp, modulus) {
  if (modulus === 1n) return 0n;
  let result = 1n;
  base = ((base % modulus) + modulus) % modulus;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % modulus;
    exp >>= 1n;
    base = (base * base) % modulus;
  }
  return result;
}

self.onmessage = function (e) {
  try {
    const { ciphertext, lambdaJ, publicKeyN } = e.data;

    const c   = BigInt(ciphertext);
    const n   = BigInt(publicKeyN);
    const n2  = n * n;
    const lam = BigInt(lambdaJ);
    // Normalise to [0, n²) in case the value is negative after mod-prime reduction
    const lamNorm = lam < 0n ? ((lam % n2) + n2) % n2 : lam;

    const Uj = modPow(c, lamNorm, n2).toString();
    self.postMessage({ Uj });
  } catch (err) {
    self.postMessage({ error: err.message });
  }
};
