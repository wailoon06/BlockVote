# BlockVote — Threshold Paillier Encryption: Complete Protocol Flow

This document is a detailed, actor-by-actor walkthrough of the entire cryptographic lifecycle of a BlockVote election.

---

## Actors & Their Roles

| Actor | Role |
|---|---|
| **Admin** | Deploys the contract, initiates key setup (`phase1-setup.js`) |
| **Trustee (×N)** | Holds one encrypted secret share; computes a Partial Decryption |
| **Organizer** | Creates the election, aggregates ciphertexts, triggers final decryption |
| **Voter** | Casts an encrypted, ZK-proved vote |
| **Smart Contract** | Immutable public ledger; stores public key, CIDs, tally, partial decryptions, results |
| **IPFS** | Stores the raw vote ciphertext JSON blobs off-chain |

---

## Phase 1 — Key Generation & Trustee Setup (`phase1-setup.js`)

### Step 1.1 — Paillier Keypair Generation
Runs locally on the Admin machine using Python (`backend/paillier_crypto.py`).

1. Generate two independent safe primes:
   $$p, q \xleftarrow{R} \text{SafePrimes}(1024\text{-bit})$$
2. Compute the public modulus:
   $$n = p \cdot q \quad (2048\text{-bit})$$
3. Compute the Carmichael totient (private key component λ):
   $$\lambda = \text{lcm}(p-1,\; q-1)$$
4. Use the simplified generator:
   $$g = n + 1$$
5. Compute the modular inverse (private key component μ):
   $$\mu = \lambda^{-1} \bmod n$$

> **Public Key exported:** `{ n }` stored as a decimal string.
> **Private Key:** `{ λ, μ, p, q }` — exists only in RAM temporarily.

---

### Step 1.2 — Upload Public Key On-Chain

The Admin calls `setPaillierPublicKey(n_string)` on the smart contract.

```
Admin Node.js  →  Contract.setPaillierPublicKey(n)
                       ↓
               paillierPublicKeyN = n
               isPaillierKeySet   = true
               emit PaillierPublicKeySet(n, timestamp)
```

From this point on, any voter can fetch `n` with `getPaillierPublicKey()`.

---

### Step 1.3 — Secret Splitting (Shamir's Secret Sharing)

The secret to be split is not λ or μ individually — it is a combined decryption exponent **S** that allows the Lagrange Combiner to directly produce the plaintext:
$$S = (\lambda \cdot \mu) \bmod (n \cdot \lambda)$$

The polynomial modulus is **M = n · λ**, not a random prime. This ties the secret space directly to the Paillier exponent space $\mathbb{Z}_{n^2}^*$ and prevents wrap-around errors.

A random degree-$(t-1)$ polynomial over $\mathbb{Z}_M$ is constructed with $S$ as the constant term:
$$f(x) = S + a_1 x + a_2 x^2 + \ldots + a_{t-1} x^{t-1} \pmod{M}$$

Each Trustee $i$ receives the evaluated share:
$$s_i = f(i) \pmod{M} \quad \text{for } i = 1, 2, \ldots, N$$

No raw $x$-coordinate needs to be kept secret; only the $y$-value $s_i$ must remain confidential.

---

### Step 1.4 — Share Encryption & Distribution

Each trustee's $s_i$ is **never written to disk as plaintext**. Before saving:

1. Admin is interactively prompted for a per-trustee passphrase in the terminal.
2. A 32-byte AES key is derived using **PBKDF2-SHA256** with 100,000 iterations and a 16-byte random salt.
3. $s_i$ is encrypted with **AES-256-GCM** using a 12-byte random nonce.

The resulting `trustee_X.json` file written to `trustee_shares/` contains:

```json
{
  "share_index": 1,
  "x": 1,
  "encrypted_y": {
    "salt": "<hex>",
    "nonce": "<hex>",
    "ciphertext": "<hex>",
    "tag": "<hex>"
  },
  "prime": "<M as decimal string>"
}
```

> `prime` here is the Shamir modulus $M = n \cdot \lambda$, stored so the Trustee browser can verify Lagrange reconstruction is working in the correct field.

---

### Step 1.5 — On-Chain Share Commitment

To allow the contract to later verify that a Trustee is submitting a Partial Decryption computed from their *genuine* share (not a random value), the Admin computes and registers a commitment on-chain for each share:

$$\text{commitment}_i = \text{keccak256}(\texttt{"}x_i\texttt{:}s_i\texttt{"})$$

```
Admin Node.js  →  Contract.submitShareCommitment(trusteeAddr, commitment_i)
                       ↓
               trustees[addr].shareCommitment       = commitment_i
               trustees[addr].hasSubmittedCommitment = true
               emit ShareCommitmentSubmitted(addr, commitment_i, timestamp)
```

---

### Step 1.6 — Private Key Destruction

After all files are saved and commitments submitted, the Admin's in-memory private key is deliberately destroyed:
```javascript
keyData.private_key_lambda = null;
keyData.private_key_mu     = null;
keyData.p = null;
keyData.q = null;
```

**No single entity holds the decryption key anymore.** Decryption is now only possible via threshold collaboration.

---

## Phase 2 — Vote Encryption (`VoterElections.js`, `voteEncryption.js`)

### Step 2.1 — Radix Slot Encoding

To pack all candidate votes into a single homomorphically addable ciphertext, votes are encoded using **Radix Slot Packing**:

1. Query the total number of registered voters from the contract:
   $$V_{\text{total}} = \texttt{getTotalRegisteredVoters()}$$
2. Compute the Slot Base $B$ — the smallest power of 10 strictly greater than $V_{\text{total}}$, minimum $10^3$:
   $$B = 10^{\lceil \log_{10}(V_{\text{total}} + 1) \rceil}, \quad B \geq 1000$$
   > This ensures every candidate's vote slot can accumulate up to $V_\text{total}$ votes without "bleeding" into the adjacent slot.
3. Translate the voter's candidate choice (zero-based index $i$) into a plaintext integer $m$:
   $$m = B^i$$
   | Candidate Index | Plaintext $m$ (when $B=1000$) |
   |---|---|
   | 0 | $1000^0 = 1$ |
   | 1 | $1000^1 = 1000$ |
   | 2 | $1000^2 = 1{,}000{,}000$ |

---

### Step 2.2 — Paillier Encryption

The voter's browser fetches the public key $n$ from the contract and encrypts $m$:

1. Generate a fresh random nonce: $r \xleftarrow{R} \mathbb{Z}_n^*$ (using `crypto.getRandomValues`)
2. Compute the ciphertext over $\mathbb{Z}_{n^2}$:
   $$c = g^m \cdot r^n \bmod n^2$$
   Because $g = n + 1$, the binomial expansion gives: $g^m = (n+1)^m \equiv 1 + mn \pmod{n^2}$, so:
   $$c = (1 + m \cdot n) \cdot r^n \bmod n^2$$
   The randomness $r$ makes the ciphertext **semantically secure** — even identical votes produce completely different ciphertexts every time.

---

### Step 2.3 — Vote Package Upload to IPFS

The encrypted vote is serialised into a JSON package and uploaded to the local IPFS Desktop node (`http://127.0.0.1:5001`):

```json
{
  "election_id": 1,
  "encrypted_vote": "<c as decimal string>",
  "vote_block": "<B as decimal string>",
  "encryption_method": "Paillier-RadixPack-JavaScript"
}
```

IPFS returns a **Content Identifier (CID)** — a cryptographic hash of the content itself.

---

### Step 2.4 — ZKP Vote Proof Generation

The voter generates a **Groth16 Zero-Knowledge Proof** using the `regCheck.circom` circuit (via `zkpProofGenerator.js`). The proof proves in zero-knowledge:
- The voter is registered (their on-chain `voterCommitment = Poseidon(walletAddress, voterSecret)` matches).
- The voter is old enough (age ≥ 18, verified against the IC birth date).
- The nullifier `H(voterSecret, electionId)` has never been used (prevents double voting).

The ZKP public signals submitted to the contract are:
```
pubSignals[0] = ageThreshold  (18)
pubSignals[1] = nullifierHash  = Poseidon(voterSecret, electionId)
pubSignals[2] = electionId
pubSignals[3] = voterCommitment = Poseidon(walletAddress, voterSecret)
```

---

### Step 2.5 — On-Chain Vote Submission

The voter calls:
```
Voter Browser  →  Contract.vote(electionId, ipfsCID, pA, pB, pC, pubSignals)
                       ↓
               1. Verifies ZKP proof via Groth16Verifier contract
               2. Checks nullifier not previously used
               3. Stores nullifier → CID mapping
               4. Increments totalVotes counter
               emit ZKPVoteCast(electionId, nullifierHash, ipfsCID, ...)
```

> The contract stores only the IPFS CID — no plaintext votes, no voter identity, no ciphertext on-chain.

---

## Phase 3 — Homomorphic Aggregation (`OrganizerManageElection.js`, `homomorphicAggregator.js`)

### Step 3.1 — Collect Ciphertexts

After the election ends, the Organizer:
1. Calls `getAllNullifiers(electionId)` to get the ordered list of vote nullifiers.
2. For each nullifier, calls `getZKPVote(electionId, nullifier)` to retrieve the IPFS CID.
3. Downloads each vote package JSON from IPFS.
4. Extracts the `encrypted_vote` and `vote_block` fields.

The `vote_block` value $B$ from the first valid IPFS package is saved for use in Phase 5 extraction.

---

### Step 3.2 — Homomorphic Addition

Paillier's core property: multiplying two ciphertexts is equivalent to adding their plaintexts:
$$\text{Enc}(m_1) \cdot \text{Enc}(m_2) = \text{Enc}(m_1 + m_2) \pmod{n^2}$$

The Organizer computes the aggregate ciphertext by multiplying all $V$ ciphertexts together:
$$C_{\text{sum}} = \prod_{k=1}^{V} c_k \bmod n^2$$

This $C_{\text{sum}}$ is the encryption of the exact sum of all vote messages:
$$C_{\text{sum}} = \text{Enc}(m_1 + m_2 + \ldots + m_V) = \text{Enc}(M_{\text{sum}})$$

No decryption has occurred. No voter's individual choice is revealed.

---

### Step 3.3 — Store Tally On-Chain

The Organizer computes a **Tally Input Hash** to prove the aggregation was performed over the correct set of votes (in nullifier order):
$$H_{\text{tally}} = \text{keccak256}(\text{CID}_1 \| \text{CID}_2 \| \ldots \| \text{CID}_V)$$

Then submits the encrypted aggregate and metadata to the contract:
```
Organizer Browser  →  Contract.storeEncryptedTally(electionId, tallyPayload, tallyInputHash)
```

Where `tallyPayload` is a JSON string:
```json
{
  "encrypted_total": "<C_sum as decimal string>",
  "vote_block": "<B as decimal string>",
  "num_candidates": 3
}
```

```
Contract:
   1. Verifies tallyInputHash matches stored nullifiers (replay protection)
   2. Sets election.tallyStored = true
   emit EncryptedTallyStored(electionId, encryptedTally, ...)
```

---

## Phase 4 — Partial Decryptions (`TrusteeDashboard.js`, `thresholdDecryption.js`)

### Step 4.1 — Share Decryption (Local, In-Browser)

Each Trustee:
1. Uploads their personal `trustee_X.json` file in the browser.
2. Enters their passphrase.
3. The browser derives the AES key using **PBKDF2-SHA256** (100,000 iterations, same salt from the file).
4. Decrypts the AES-256-GCM ciphertext to recover the raw share value $s_i$.

The passphrase and plaintext $s_i$ **never leave the browser**.

---

### Step 4.2 — Partial Decryption Computation (Local, In-Browser)

The Trustee's browser fetches $C_{\text{sum}}$ from the contract and computes the Partial Decryption using their secret share as an exponent entirely in the $\mathbb{Z}_{n^2}$ group:
$$PD_i = (C_{\text{sum}})^{s_i} \bmod n^2$$

This computation is done using `BigInt` modular exponentiation in `thresholdDecryption.js::computeTrusteePartialDecryption`. The share $s_i$ is used and immediately discarded — it is not stored, not returned, and not transmitted.

---

### Step 4.3 — Submit Partial Decryption On-Chain

The Trustee submits only $PD_i$ — a 2048-bit number — to the contract:
```
Trustee Browser  →  Contract.submitPartialDecryption(electionId, PD_i_string)
                         ↓
                 partialDecryptions[electionId][trusteeAddr] = PD_i_string
                 emit PartialDecryptionSubmitted(electionId, trusteeAddr)
```

> The contract stores $PD_i$ per (electionId, trusteeAddress) pair. Anyone can read these values since $PD_i$ alone reveals nothing — you need at least $t$ of them together.

---

## Phase 5 — Combination & Result Extraction (`OrganizerManageElection.js`, `thresholdDecryption.js`)

### Step 5.1 — Collect Partial Decryptions from Chain

Once at least $t$ Trustees have submitted, the Organizer:
1. Calls `getPartialDecryptionSubmitters(electionId)` to get the list of submitters.
2. Calls `getPartialDecryption(electionId, trusteeAddr)` for each to get their $PD_i$.
3. Calls `getTrusteeAddresses()` to map each address to its $x$-coordinate (Trustee index, 1-based).

This produces a set of $(x_i,\; PD_i)$ pairs.

---

### Step 5.2 — Lagrange Interpolation in the Exponent

The Combiner does NOT reconstruct the secret $S$ directly. Instead, it uses the multiplicative structure of $\mathbb{Z}_{n^2}^*$ to combine the Partial Decryptions using **integer Lagrange coefficients**.

**a) Compute raw Lagrange fractions for $x=0$:**

For each participant $i$ in the set of submitters, compute:
$$\tilde{\lambda}_i = \prod_{j \ne i} \frac{0 - x_j}{x_i - x_j} = \frac{N_i}{D_i}$$

**b) Compute the common scaling factor $\Delta$:**

To ensure integer exponents (since fractional exponents modulo $n^2$ do not exist), the Combiner computes $\Delta$ as the product of the absolute values of all denominators $D_i$:
$$\Delta = \prod_{i} |D_i|$$

Because $\Delta$ is constructed to be divisible by every $D_i$, the scaled coefficients $\lambda_i = (\Delta / D_i) \cdot N_i$ are guaranteed whole integers.

**c) Combine in the exponent:**

$$V = \prod_{i} (PD_i)^{\lambda_i} \bmod n^2$$

By the laws of modular exponentiation and the Shamir interpolation theorem:
$$V = (C_{\text{sum}})^{S \cdot \Delta} \bmod n^2 = \text{Enc}(M_{\text{sum}} \cdot \Delta)$$

Note: Negative $\lambda_i$ are handled by exponentiating the modular inverse of $PD_i$.

---

### Step 5.3 — Paillier L-Function Extraction

Apply the Paillier $L$-function to extract the scaled plaintext:
$$L(V) = \frac{V - 1}{n} \bmod n$$

This gives:
$$L(V) \equiv M_{\text{sum}} \cdot \Delta \pmod{n}$$

Remove the $\Delta$ scaling factor using its modular inverse:
$$M_{\text{sum}} = L(V) \cdot \Delta^{-1} \bmod n$$

where $\Delta^{-1}$ is the Extended Euclidean (modular) inverse of $\Delta$ modulo $n$.

---

### Step 5.4 — Radix Slot Decoding

$M_{\text{sum}}$ is the homomorphic sum of all individual vote plaintexts. Using base $B$ (retrieved from the stored `vote_block`):

$$\text{votes}[i] = \left\lfloor \frac{M_{\text{sum}}}{B^i} \right\rfloor \bmod B$$

This is a simple digit extraction loop implemented in `extractVoteCounts`:
```javascript
let tmp = BigInt(msum);
for (let i = 0; i < numCandidates; i++) {
    perCandidateVotes[i] = Number(tmp % B);
    tmp /= B;
}
```

**Example** (3 candidates, B=1000, 2 voters: one for Candidate 1, one for Candidate 2):
```
M_sum = 1000^1 + 1000^2 = 1,001,000
votes[0] = 1001000 % 1000        = 0
votes[1] = (1001000 / 1000) % 1000 = 1
votes[2] = (1001000 / 1000000) % 1000 = 1
```

---

### Step 5.5 — Publish Results On-Chain

The Organizer serialises the final per-candidate tally into a JSON payload and submits it:
```
Organizer Browser  →  Contract.publishResults(electionId, resultPayload)
```

Where `resultPayload` is:
```json
{
  "election_id": 1,
  "total_votes": 2,
  "per_candidate_votes": { "0": 0, "1": 1, "2": 1 },
  "candidates": ["0xABC...", "0xDEF..."],
  "method": "Threshold Paillier – Ping-Pong",
  "published_at": "2026-03-10T..."
}
```

```
Contract:
   1. Sets election.resultsPublished = true
   2. Stores decryptedResult string
   emit ResultsPublished(electionId, decryptedResult, timestamp)
```

Anyone can now call `getResults(electionId)` to read the final tally.

---

## Data Flow Summary

```
                     [Phase 1]  ADMIN
                         │
    Python (paillier_crypto.py) generates (n, g, λ, μ, p, q)
    Shamir splits S=(λμ mod nλ) into shares (s1, s2, s3)
    Each si encrypted under   AES-256-GCM / PBKDF2 passphrase
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
  trustee_1.json   trustee_2.json   trustee_3.json    (distributed physically)
         │
  Contract.setPaillierPublicKey(n)   → Blockchain stores n
  Contract.submitShareCommitment(…)  → Blockchain stores keccak256(x:s_i)
  Private key λ, μ DESTROYED from memory


                     [Phase 2]  VOTER
                         │
    Browser fetches n from Contract.getPaillierPublicKey()
    Computes B = computeVoteBlock(totalVoters)
    Encodes choice: m = B^candidateIndex
    Encrypts:       c = (1 + m·n) · r^n  mod n²
    Uploads JSON {encrypted_vote: c, vote_block: B}  → IPFS → CID
    Generates Groth16 ZKP (regCheck.circom)
    Contract.vote(electionId, CID, proof, pubSignals)


                     [Phase 3]  ORGANIZER
                         │
    Fetches all CIDs from Contract
    Downloads all vote JSON packages from IPFS
    Multiplies all ciphertexts:   C_sum = c1·c2·…·cV  mod n²
    Contract.storeEncryptedTally(electionId, {encrypted_total: C_sum, …})


                     [Phase 4]  EACH TRUSTEE (independently)
                         │
    Opens trustee_X.json + enters passphrase (browser-local)
    PBKDF2 derives AES key → AES-GCM decrypts → recovers s_i
    Fetches C_sum from Contract
    Computes PD_i = C_sum^{s_i}  mod n²    (in-browser BigInt)
    Contract.submitPartialDecryption(electionId, PD_i)  (s_i never leaves browser)


                     [Phase 5]  ORGANIZER (after ≥t PDs submitted)
                         │
    Fetches all PD_i from contract
    Computes integer Lagrange weights λ_i = (Δ/D_i)·N_i
    Combines:     V   = ∏ PD_i^{λ_i}  mod n²
    Extracts:     M   = L(V)·Δ⁻¹  mod n     where L(u)=(u-1)/n
    Decodes:      votes[i] = floor(M / B^i) mod B
    Contract.publishResults(electionId, { per_candidate_votes, … })
```

---

## Security Properties

| Property | Mechanism |
|---|---|
| **Ballot secrecy** | Paillier semantic security; random nonce $r$ per vote |
| **Eligibility privacy** | Groth16 ZK proof; voter identity not in ciphertext |
| **Double-vote prevention** | On-chain nullifier (Poseidon hash) checked per election |
| **Key non-custody** | Private key destroyed after splitting; no single holder |
| **Threshold trust** | Any $t$-of-$N$ Trustees required; $t-1$ compromised trustees reveal nothing |
| **Share secrecy** | AES-256-GCM + PBKDF2 (100k iter); plaintext never on disk |
| **Partial decryption binding** | On-chain `shareCommitment = keccak256(x:s_i)` prevents arbitrary PD uploads |
| **Tally integrity** | `tallyInputHash = keccak256(CID_0 ‖ CID_1 ‖ …)` verified on-chain |
| **Auditability** | `ZKPVoteCast` event links voter address → IPFS CID (but not their choice) |
