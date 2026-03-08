#!/usr/bin/env python3
"""
Homomorphic Aggregator — Radix Slot Packing Scheme
===================================================

Each vote is a SINGLE Paillier ciphertext encrypting:

    plaintext = B ^ candidateIndex

where B (vote_block) is the smallest power of 10 strictly greater than the
total number of registered voters for the election.  This prevents carry-bleed
between candidate slots while minimising slot width, maximising the number of
candidates that fit within the Paillier modulus.

Aggregation (homomorphic multiplication / Paillier addition):

    E(v_1) * E(v_2) * ... = E(v_1 + v_2 + ...) = E(msum)

Only ONE decryption is performed at Phase 4.

Extraction at Phase 4:

    count[i] = floor(msum / B^i) mod B

Voter identity is NOT embedded — auditability is provided by the on-chain
EncryptedVoteCast event that maps voter address → IPFS CID.

Usage:
    python homomorphic_aggregator.py <votes_json_file>

Input JSON:
    {
        "public_key_n"   : "...",
        "num_candidates" : 3,
        "vote_block"     : "1000",       <-- B from compute_vote_block(total_voters)
        "encrypted_votes": ["ct1", "ct2", ...]
    }

Output JSON:
    {
        "encrypted_total" : "big ciphertext string",
        "vote_count"      : 3,
        "num_candidates"  : 3,
        "vote_block"      : "1000",
        "method"          : "Paillier-RadixPack"
    }
"""

import sys
import json
from paillier_crypto import PaillierPublicKey



def perform_homomorphic_aggregation(public_key_n, encrypted_votes):
    """
    Multiply all ciphertexts to obtain E(msum).

    Paillier homomorphic property:
        E(a) * E(b) mod n^2  =  E(a + b) mod n^2

    Args:
        public_key_n (str):         Paillier modulus as decimal string.
        encrypted_votes (list[str]): Ciphertext strings (one per voter).

    Returns:
        str: The encrypted aggregate sum as a decimal string.
    """
    pk = PaillierPublicKey(int(public_key_n))
    n_sq = pk.n_squared

    encrypted_total = 1  # Paillier identity: E(0) = 1
    for ct_str in encrypted_votes:
        encrypted_total = (encrypted_total * int(ct_str)) % n_sq

    return str(encrypted_total)


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python homomorphic_aggregator.py <votes_json_file>"}))
        sys.exit(1)

    try:
        with open(sys.argv[1], 'r') as f:
            data = json.load(f)

        public_key_n    = data["public_key_n"]
        num_candidates  = int(data["num_candidates"])
        vote_block      = int(data["vote_block"])      # B from compute_vote_block
        encrypted_votes = data["encrypted_votes"]      # list of ciphertext strings

        if not encrypted_votes:
            print(json.dumps({"error": "No encrypted votes provided"}))
            sys.exit(1)

        encrypted_total = perform_homomorphic_aggregation(public_key_n, encrypted_votes)

        print(json.dumps({
            "encrypted_total" : encrypted_total,
            "vote_count"      : len(encrypted_votes),
            "num_candidates"  : num_candidates,
            "vote_block"      : str(vote_block),
            "method"          : "Paillier-RadixPack"
        }))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
if __name__ == "__main__":
    main()
