"""
Vote Encryption Utility for Phase 2

Encrypts a vote using radix slot packing with Paillier homomorphic encryption.

  B        = compute_vote_block(total_voters)
             smallest power of 10 strictly greater than total registered voters
  plaintext = B ^ candidate_index

Each candidate occupies one radix-B slot.  After homomorphic aggregation:

  count[i] = floor(msum / B^i) mod B

Using the minimum B for a given election maximises the number of candidates
that can be packed before a 1024-bit Paillier modulus is exceeded:

  max_candidates = floor(309 / digits(B))
  e.g.  100  voters → B = 10^3  → 103 candidates
        10k  voters → B = 10^5  →  61 candidates
        1M   voters → B = 10^7  →  44 candidates

Voter identity is NOT embedded — auditability is provided by the on-chain
EncryptedVoteCast event that maps voter address → IPFS CID.
"""

import math
import sys
import json
from paillier_crypto import PaillierPublicKey


def compute_vote_block(total_voters: int) -> int:
    """
    Return the smallest power of 10 strictly greater than total_voters.
    Minimum returned value is 10^3 = 1000.

    Args:
        total_voters: Total registered voter count for the election.

    Returns:
        int: The slot base B.
    """
    digits = max(3, math.floor(math.log10(total_voters + 1)) + 1)
    return 10 ** digits


def encrypt_vote(public_key_n: str, candidate_index: int, vote_block: int) -> dict:
    """
    Encrypt a vote using Paillier radix slot packing.

    Args:
        public_key_n:    Public key modulus as decimal string.
        candidate_index: 0-based index of the chosen candidate.
        vote_block:      Slot base B (from compute_vote_block).

    Returns:
        dict: { encrypted_vote, vote_block, encryption_method }
    """
    n = int(public_key_n)
    public_key = PaillierPublicKey(n)

    plaintext = vote_block ** candidate_index

    ciphertext = public_key.encrypt(plaintext)

    return {
        'encrypted_vote': str(ciphertext),
        'vote_block': str(vote_block),
        'encryption_method': 'Paillier-RadixPack'
    }


def homomorphic_tally(encrypted_votes: list, public_key_n: str) -> str:
    """
    Tally encrypted votes homomorphically (without decryption).

    Args:
        encrypted_votes: List of ciphertext strings.
        public_key_n:    Public key modulus as decimal string.

    Returns:
        str: Encrypted sum as a decimal string.
    """
    n = int(public_key_n)
    public_key = PaillierPublicKey(n)

    if not encrypted_votes:
        return str(1)  # Paillier identity: E(0) = 1

    total = int(encrypted_votes[0])
    for i in range(1, len(encrypted_votes)):
        total = public_key.homomorphic_add(total, int(encrypted_votes[i]))

    return str(total)


if __name__ == "__main__":
    # CLI interface: python vote_encryptor.py <public_key_n> <candidate_index> <total_voters>
    if len(sys.argv) < 4:
        print(json.dumps({
            'error': 'Usage: python vote_encryptor.py <public_key_n> <candidate_index> <total_voters>'
        }))
        sys.exit(1)

    public_key_n    = sys.argv[1]
    candidate_index = int(sys.argv[2])
    total_voters    = int(sys.argv[3])
    vote_block      = compute_vote_block(total_voters)

    try:
        result = encrypt_vote(public_key_n, candidate_index, vote_block)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)
