"""
Shamir's Secret Sharing Implementation
"""

import random
import secrets
from typing import List, Tuple

# RFC 3526 MODP Group 14 – 2048-bit safe prime (standardised, well-audited).
# Using a fixed well-known prime guarantees information-theoretic security:
# any subset of shares below the threshold reveals zero information about the
# secret when arithmetic is done in this finite field.
DEFAULT_PRIME = int(
    'FFFFFFFFFFFFFFFF'
    'C90FDAA22168C234C4C6628B80DC1CD1'
    '29024E088A67CC74020BBEA63B139B22'
    '514A08798E3404DDEF9519B3CD3A431B'
    '302B0A6DF25F14374FE1356D6D51C245'
    'E485B576625E7EC6F44C42E9A637ED6B'
    '0BFF5CB6F406B7EDEE386BFB5A899FA5'
    'AE9F24117C4B1FE649286651ECE45B3D'
    'C2007CB8A163BF0598DA48361C55D39A'
    '69163FA8FD24CF5F83655D23DCA3AD96'
    '1C62F356208552BB9ED529077096966D'
    '670C354E4ABC9804F1746C08CA18217C'
    '32905E462E36CE3BE39E772C180E8603'
    '9B2783A2EC07A28FB5C55DF06F4C52C9'
    'DE2BCBF6955817183995497CEA956AE5'
    '15D2261898FA051015728E5A8AACAA68'
    'FFFFFFFFFFFFFFFF',
    16
)


class ShamirSecretSharing:
    """Shamir's Secret Sharing scheme for threshold cryptography"""
    
    def __init__(self, prime: int = None):
        """
        Initialize Shamir's Secret Sharing

        Args:
            prime: The operating modulus. For Threshold Paillier, this is typically
                   set to n * lambda to ensure the polynomial maps directly to the
                   exponent space Z_{n^2}^* without wrapping incorrectly.
        """
        self.prime = prime if prime is not None else DEFAULT_PRIME
    
    def _generate_polynomial(self, secret: int, degree: int) -> List[int]:
        """
        Generate random polynomial with secret as constant term

        f(x) = secret + a1*x + a2*x^2 + ... + a_degree*x^degree
        """
        coefficients = [secret % self.prime] + [
            secrets.randbelow(self.prime) for _ in range(degree)
        ]
        return coefficients
    
    def _evaluate_polynomial(self, coefficients: List[int], x: int) -> int:
        """Evaluate polynomial at point x (mod prime)."""
        result = 0
        for i, coef in enumerate(coefficients):
            result = (result + coef * pow(x, i, self.prime)) % self.prime
        return result
    
    def split_secret(self, secret: int, threshold: int, num_shares: int) -> List[Tuple[int, int]]:
        """
        Split secret into shares using Shamir's scheme
        
        Args:
            secret: The secret value to split
            threshold: Minimum number of shares needed to reconstruct
            num_shares: Total number of shares to create
            
        Returns:
            List of (x, y) coordinate tuples representing shares
        """
        if threshold > num_shares:
            raise ValueError("Threshold cannot be greater than number of shares")
        
        if threshold < 2:
            raise ValueError("Threshold must be at least 2")
        
        # Generate polynomial of degree (threshold - 1)
        degree = threshold - 1
        polynomial = self._generate_polynomial(secret, degree)
        
        # Generate shares as (x, f(x)) for x = 1, 2, ..., num_shares
        shares = []
        for x in range(1, num_shares + 1):
            y = self._evaluate_polynomial(polynomial, x)
            shares.append((x, y))
        
        return shares
