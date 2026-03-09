"""
Paillier Homomorphic Encryption Implementation
"""

import secrets
from math import gcd
from typing import Tuple


def lcm(a: int, b: int) -> int:
    """Compute least common multiple"""
    return abs(a * b) // gcd(a, b)


def mod_inverse(a: int, m: int) -> int:
    """Compute modular multiplicative inverse using extended Euclidean algorithm"""
    if gcd(a, m) != 1:
        raise ValueError("Modular inverse does not exist")
    
    # Extended Euclidean Algorithm
    m0, x0, x1 = m, 0, 1
    while a > 1:
        q = a // m
        m, a = a % m, m
        x0, x1 = x1 - q * x0, x0
    
    return x1 + m0 if x1 < 0 else x1


def is_prime(n: int, k: int = 40) -> bool:
    """Miller-Rabin primality test"""
    if n < 2:
        return False
    if n == 2 or n == 3:
        return True
    if n % 2 == 0:
        return False
    
    # Write n-1 as 2^r * d
    r, d = 0, n - 1
    while d % 2 == 0:
        r += 1
        d //= 2
    
    # Witness loop
    for _ in range(k):
        a = secrets.randbelow(n - 3) + 2  # uniform in [2, n-2]
        x = pow(a, d, n)
        
        if x == 1 or x == n - 1:
            continue
        
        for _ in range(r - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    
    return True


def generate_prime(bits: int) -> int:
    """Generate a random prime number with specified bit length"""
    while True:
        num = secrets.randbits(bits)
        # Set MSB and LSB to ensure odd number of correct bit length
        num |= (1 << bits - 1) | 1
        if is_prime(num):
            return num


class PaillierPublicKey:
    """Paillier public key"""
    
    def __init__(self, n: int):
        self.n = n
        self.n_squared = n * n
        self.g = n + 1  # Simplified generator
    
    def encrypt(self, plaintext: int) -> int:
        """Encrypt a plaintext message"""
        if plaintext < 0 or plaintext >= self.n:
            raise ValueError(f"Plaintext must be in range [0, {self.n})")
        
        # Generate random r
        while True:
            r = secrets.randbelow(self.n - 1) + 1  # uniform in [1, n-1]
            if gcd(r, self.n) == 1:
                break
        
        # c = g^m * r^n mod n^2
        ciphertext = (pow(self.g, plaintext, self.n_squared) * 
                     pow(r, self.n, self.n_squared)) % self.n_squared
        
        return ciphertext
    
    def homomorphic_add(self, c1: int, c2: int) -> int:
        """Add two encrypted values (multiplication in ciphertext space)"""
        return (c1 * c2) % self.n_squared
    
    def to_dict(self) -> dict:
        """Convert to dictionary for serialization"""
        return {'n': self.n}
    
    @classmethod
    def from_dict(cls, data: dict):
        """Create from dictionary"""
        return cls(data['n'])


class PaillierPrivateKey:
    """Paillier private key"""
    
    def __init__(self, p: int, q: int, public_key: PaillierPublicKey):
        self.p = p
        self.q = q
        self.public_key = public_key
        self.lambda_value = lcm(p - 1, q - 1)
        self.mu = mod_inverse(self.lambda_value, public_key.n)
    
    def decrypt(self, ciphertext: int) -> int:
        """Decrypt a ciphertext"""
        n = self.public_key.n
        n_squared = self.public_key.n_squared
        
        # L(c^lambda mod n^2)
        u = pow(ciphertext, self.lambda_value, n_squared)
        L_u = (u - 1) // n
        
        # Plaintext = L_u * mu mod n
        plaintext = (L_u * self.mu) % n
        
        return plaintext
    
    def get_lambda(self) -> int:
        """Get the lambda value (used for secret sharing)"""
        return self.lambda_value


class PaillierCrypto:
    """Main Paillier cryptosystem class"""
    
    def __init__(self, key_length: int = 2048):
        self.key_length = key_length
    
    def generate_keypair(self) -> Tuple[PaillierPublicKey, PaillierPrivateKey]:
        """Generate a new Paillier keypair"""
        # Generate two large primes
        bits = self.key_length // 2
        p = generate_prime(bits)
        q = generate_prime(bits)
        
        # Ensure p != q
        while p == q:
            q = generate_prime(bits)
        
        # Compute n = p * q
        n = p * q
        
        # Create keys
        public_key = PaillierPublicKey(n)
        private_key = PaillierPrivateKey(p, q, public_key)
        
        return public_key, private_key
