# BlockVote — Zero-Knowledge Proof System: Technical Reference

## Table of Contents
1. [System Overview](#1-system-overview)
2. [The `regCheck` Circom Circuit](#2-the-regcheck-circom-circuit)
3. [Trusted Setup](#3-trusted-setup)
4. [Public Signals Reference](#4-public-signals-reference)
5. [Poseidon Hash Usage](#5-poseidon-hash-usage)
6. [Proof Generation Flow (Browser)](#6-proof-generation-flow-browser)
7. [Groth16 Verifier: Deployment & Wiring](#7-groth16-verifier-deployment--wiring)
8. [Voter Registration & Verification](#8-voter-registration--verification)
9. [Candidate Registration & Verification](#9-candidate-registration--verification)
10. [Vote Casting](#10-vote-casting)
11. [On-Chain Verification Logic](#11-on-chain-verification-logic)
12. [Test Utilities](#12-test-utilities)
13. [End-to-End ZKP Flow Diagram](#13-end-to-end-zkp-flow-diagram)

---

## 1. System Overview

BlockVote's ZKP layer uses **Groth16** proofs over the **BN254** (alt-BN128) elliptic curve, compiled from a single Circom 2.0 circuit called `regCheck`. The same circuit covers three distinct use cases:

| Use Case | `electionId` | Purpose |
|---|---|---|
| Voter identity verification | `0` (sentinel) | Proves IC validity, age ≥ 18, binds wallet to anonymous `voterCommitment` |
| Candidate identity verification | `0` (sentinel) | Same age/identity check, no voting commitment issued |
| Vote casting | actual election ID | Proves registration, unique nullifier, valid in-range candidate choice |

**Zero-knowledge guarantee:** The prover reveals nothing about their IC digits, `voterSecret`, wallet address, or candidate selection — only the 9 public signals (all derived via Poseidon hash or date/threshold constants) are exposed on-chain.

---

## 2. The `regCheck` Circom Circuit

**File:** `circuits/regCheck.circom`
**Compiler:** Circom 2.0.0
**Imports:** `circomlib/circuits/comparators.circom`, `circomlib/circuits/poseidon.circom`, `circomlib/circuits/bitify.circom`

### 2.1 Private Inputs (4 signals)

| Signal | Type | Description |
|---|---|---|
| `ic[12]` | field[12] | Individual decimal digits of the 12-digit Malaysian IC number (dashes stripped) |
| `voterSecret` | field | Random BN128 scalar, generated once per wallet and stored in browser `localStorage` |
| `voterAddress` | field | Voter's Ethereum address coerced to a field element (`BigInt(address)`) |
| `candidateIndex` | field | 0-based index of the selected candidate |

### 2.2 Public Inputs (9 signals — `nPublic = 9`)

| Index | Signal | Description |
|---|---|---|
| [0] | `ageThreshold` | Constant `18`; circuit verifies age ≥ this value |
| [1] | `nullifierHash` | `Poseidon(voterSecret, electionId)` |
| [2] | `electionId` | Target election (or `0` as registration sentinel) |
| [3] | `voterCommitment` | `Poseidon(voterAddress, voterSecret)` |
| [4] | `currentYear` | UTC year at proof generation |
| [5] | `currentMonth` | UTC month at proof generation |
| [6] | `currentDay` | UTC day at proof generation |
| [7] | `numCandidates` | Count of approved candidates in the election |
| [8] | `choiceCommitment` | `Poseidon(candidateIndex, voterSecret, electionId)` |

### 2.3 Constraint Groups (9 groups)

**Group 1 — IC digit range validation:**
Each of the 12 digits is checked via `Num2Bits(4)` (proves it fits in 4 bits) and `LessEqThan(4)` (proves it is ≤ 9). Without this, a prover could inject non-decimal field elements that satisfy hash constraints but represent no real IC number.

**Group 2 — Extract birth date components:**
$$\text{year2} = ic[0] \times 10 + ic[1], \quad \text{month} = ic[2] \times 10 + ic[3], \quad \text{day} = ic[4] \times 10 + ic[5]$$

**Group 3 — Birth date plausibility:**
`GreaterEqThan` and `LessEqThan` comparators enforce month ∈ [1, 12] and day ∈ [1, 31].

**Group 4 — Full year reconstruction:**
The IC's `yy` component is disambiguated:
$$\text{fullYear} = \begin{cases} 2000 + \text{year2} & \text{if year2} \leq 26 \\ 1900 + \text{year2} & \text{if year2} > 26 \end{cases}$$
Implemented as a `LessEqThan(8)` comparator whose output bit $b$ drives:
$$\text{fullYear} = b \cdot (2000 + \text{year2}) + (1 - b) \cdot (1900 + \text{year2})$$

**Group 5 — Age ≥ 18 check:**
Encodes dates as integers:
$$\text{birthDate} = \text{fullYear} \times 10000 + \text{month} \times 100 + \text{day}$$
$$\text{currentDate} = \text{currentYear} \times 10000 + \text{currentMonth} \times 100 + \text{currentDay}$$
Then a `GreaterEqThan(25)` comparator asserts:
$$\text{currentDate} \geq \text{birthDate} + \text{ageThreshold} \times 10000$$

**Group 6 — Voter commitment constraint:**
$$\text{Poseidon}(\text{voterAddress},\ \text{voterSecret}) = \text{voterCommitment}$$
This is a circuit equality constraint — the public `voterCommitment` is pinned to the private identity.

**Group 7 — Nullifier constraint:**
$$\text{Poseidon}(\text{voterSecret},\ \text{electionId}) = \text{nullifierHash}$$
Ensures the nullifier on-chain is uniquely derived from the secret and the specific election.

**Group 8 — Candidate range check:**
A `LessThan(8)` comparator asserts `candidateIndex < numCandidates`. Supports up to 255 candidates.

**Group 9 — Choice commitment constraint:**
$$\text{Poseidon}(\text{candidateIndex},\ \text{voterSecret},\ \text{electionId}) = \text{choiceCommitment}$$
Binds the anonymous on-chain choice commitment to a provably in-range candidate index.

### 2.4 What is Proven in Zero-Knowledge

By completing a valid proof, the prover demonstrates — without revealing any private inputs — that:
- They know a valid 12-digit Malaysian IC number with all digits in range [0–9]
- The IC encodes a birth date with valid month and day ranges
- The holder is at least 18 years old as of the supplied block date
- The `voterCommitment` is the Poseidon hash of their wallet address and secret
- The `nullifierHash` is the Poseidon hash of their secret and the specified election
- The `choiceCommitment` is the Poseidon hash of a valid, in-range candidate index with their secret and election

---

## 3. Trusted Setup

### 3.1 Phase 1 — Powers of Tau (Circuit-Agnostic)

Uses the **BN254** curve (`bn128` in snarkjs). The Groth16 protocol parameters are stored in `smart-contract/verification_key.json`:

| Field | Description |
|---|---|
| `vk_alpha_1` | $[\alpha]_1$ — G1 point |
| `vk_beta_2` | $[\beta]_2$ — G2 point |
| `vk_gamma_2` | $[\gamma]_2$ — G2 point |
| `vk_delta_2` | $[\delta]_2$ — G2 point |
| `vk_alphabeta_12` | Precomputed $e(\alpha, \beta)$ pairing |
| `IC[0..8]` | 9 G1 points for the linear combination ($IC_0$ + one per public signal) |

> Note: `verification_key.json` has `nPublic = 7` (an older variant). The deployed `Groth16Verifier.sol` uses `nPublic = 9` (10 IC points IC0–IC9), corresponding to the current `regCheck` circuit.

### 3.2 Phase 2 — Circuit-Specific Setup

After compiling `regCheck.circom` to R1CS and generating a witness calculator WASM, `snarkjs groth16 setup` was run with the Phase 1 PTau output to produce:

- **`regCheck_final.zkey`** — the proving key. Placed in `dapp/public/zkp/`, served statically by the React app.
  - SHA-256: `a22453b5bbd88490d2adab18c9bc877399eef9fa2a929c42e2614fadf23e16ad`
  - Verified at runtime by `zkpArtifactLoader.js` via `crypto.subtle.digest('SHA-256', ...)`

- **`Verifier.sol`** — auto-generated by `snarkjs zkey export solidityverifier`. All verification key constants are hard-coded as `uint256 constant` values (IC0x/IC0y through IC9x/IC9y, alpha, beta, gamma, delta). This contract is never updated after deployment.

### 3.3 Artifact Delivery

Both proving artifacts are served from the React app's static public directory:

| File | Path | Purpose |
|---|---|---|
| `regCheck.wasm` | `dapp/public/zkp/regCheck.wasm` | Circom witness calculator (WebAssembly) |
| `regCheck_final.zkey` | `dapp/public/zkp/regCheck_final.zkey` | Groth16 proving key |

Configured in `dapp/src/config/zkpConfig.js`, which exports the paths and SHA-256 checksum for integrity verification.

---

## 4. Public Signals Reference

| Index | Signal | On-Chain Check | Notes |
|---|---|---|---|
| [0] | `ageThreshold = 18` | `pubSignals[0] == 18` | Hard-coded; any proof with a different threshold is rejected |
| [1] | `nullifierHash` | `nullifierUsed[electionId][nullifier] == false` | Unique per (voter, election); prevents double-voting without revealing identity |
| [2] | `electionId` | `pubSignals[2] == electionId` (voting) or `== 0` (registration) | Election binding; prevents replaying a vote proof for a different election |
| [3] | `voterCommitment` | `voterCommitments[bytes32(pubSignals[3])] == true` | Must have been stored during verified registration |
| [4] | `currentYear` | Must match `_timestampToDate(block.timestamp).year` | Prevents proof replay across different UTC days |
| [5] | `currentMonth` | Must match `_timestampToDate(block.timestamp).month` | Same staleness prevention |
| [6] | `currentDay` | Must match `_timestampToDate(block.timestamp).day` | Same staleness prevention |
| [7] | `numCandidates` | `pubSignals[7] == getApprovedCandidates(electionId).length` | Prevents fabricating a loose upper bound to vote for a non-existent candidate |
| [8] | `choiceCommitment` | Stored as `voteChoiceCommitments[electionId][nullifier]` | Lets voter later prove which candidate they voted for using their `voterSecret` |

---

## 5. Poseidon Hash Usage

All hashing is done via `circomlibjs` (`buildPoseidon()`) in `dapp/src/utils/poseidonUtils.js`.

### 5.1 Voter Commitment
$$\text{commitment} = \text{Poseidon}([\text{BigInt}(\text{walletAddress}),\ \text{BigInt}(\text{voterSecret})])$$
- Stored on-chain in `voterCommitments[commitment] = true` during `verifyVoterWithZKP`
- Used during `vote()` to confirm the anonymous prover was previously verified
- Bridges the verified identity phase to the anonymous voting phase

### 5.2 Nullifier
$$\text{nullifier} = \text{Poseidon}([\text{BigInt}(\text{voterSecret}),\ \text{BigInt}(\text{electionId})])$$
- Unique per (voter, election) pair
- Pre-computed client-side to check `hasVoterVoted()` before rendering the UI ("✓ Vote Cast")
- Stored on-chain in `nullifierUsed[electionId][nullifier] = true` to block re-submission

### 5.3 Choice Commitment
$$\text{choiceCommitment} = \text{Poseidon}([\text{BigInt}(\text{candidateIndex}),\ \text{BigInt}(\text{voterSecret}),\ \text{BigInt}(\text{electionId})])$$
- Links the anonymous IPFS ballot (Paillier ciphertext) to a proven in-range candidate index
- Stored on-chain as `voteChoiceCommitments[electionId][nullifier]`
- Voter can later reveal `(candidateIndex, voterSecret)` off-chain to prove their vote to a third party

### 5.4 Voter Secret Management

`generateVoterSecret(walletAddress)` in `poseidonUtils.js`:
1. Sample 32 bytes via `window.crypto.getRandomValues(new Uint8Array(32))`
2. Reduce modulo the BN128 scalar field order:
   $$p = 21888242871839275222246405745257275088548364400416034343698204186575808495617$$
3. Store as decimal string in `localStorage` under key `voterSecret_<walletAddress>`

The secret is **never transmitted** anywhere — all hashes are computed client-side and only the hash outputs leave the browser.

### 5.5 `toBytes32`

Converts a Poseidon output (decimal string) to a `bytes32` hex string for Solidity:
```
toBytes32(decimalStr) → '0x' + BigInt(decimal).toString(16).padStart(64, '0')
```

---

## 6. Proof Generation Flow (Browser)

**Entry points in `dapp/src/utils/zkpProofGenerator.js`:**
- `generateRegistrationProof(ic, walletAddress, voterSecret)` — for identity verification
- `generateVoteProof(ic, walletAddress, voterSecret, electionId, candidateIndex, numCandidates)` — for vote casting

### Step 1 — Pre-flight Age Validation
`validateICAge(ic)`: Parses IC to extract YY/MM/DD, applies the `yy ≤ 26` disambiguation rule, computes integer age, and throws a human-friendly error immediately if `age < 18`. Avoids spending 10–30 seconds generating a provably-failing proof.

### Step 2 — IC Normalization
`normalizeIC(ic)` strips spaces and inserts dashes in the standard Malaysian IC format if absent. Dashes are then stripped and the 12-digit string is split into individual character digits: `["9","0","0","1","0","1",...]`.

### Step 3 — Circuit Input Assembly
`buildVoteCircuitInput` assembles the full circom input object:

**Private inputs:**
| Field | Value |
|---|---|
| `ic` | 12-element digit array |
| `voterSecret` | Decimal string from localStorage |
| `voterAddress` | `BigInt(walletAddress).toString()` |
| `candidateIndex` | String (index of selected candidate) |

**Public inputs:**
| Field | Value |
|---|---|
| `ageThreshold` | `'18'` |
| `nullifierHash` | `await computeNullifier(voterSecret, electionId)` |
| `electionId` | String |
| `voterCommitment` | `await computeCommitment(voterAddress, voterSecret)` |
| `currentYear/Month/Day` | From `new Date().getUTCFullYear()` etc. |
| `numCandidates` | String |
| `choiceCommitment` | `await computeChoiceCommitment(candidateIndex, voterSecret, electionId)` |

> For registration: `electionId = '0'`, `candidateIndex = '0'`, `numCandidates = '1'` (dummy — satisfies `0 < 1` constraint).

### Step 4 — Artifact Loading
`loadVoteWasm()` and `loadVoteZkey()` call `fetch('/zkp/regCheck.wasm')` and `fetch('/zkp/regCheck_final.zkey')`. Optionally verifies SHA-256 integrity via `crypto.subtle.digest('SHA-256', buffer)` compared against the checksum in `zkpConfig.js`.

### Step 5 — Proof Generation
```
snarkjs.groth16.fullProve(input, wasmBuffer, zkeyBuffer)
  → { proof, publicSignals }   // publicSignals: array of 9 decimal strings
```
Runs the WASM witness calculator then the Groth16 prover. Takes **10–30 seconds** on typical consumer hardware. Entirely in-browser; no server round-trip.

### Step 6 — Solidity Calldata Formatting
```
snarkjs.groth16.exportSolidityCallData(proof, publicSignals)
  → JSON-parse → [pA, pB, pC, pubSignals]
```
| Variable | Type | Description |
|---|---|---|
| `pA` | `uint[2]` | G1 proof point A |
| `pB` | `uint[2][2]` | G2 proof point B |
| `pC` | `uint[2]` | G1 proof point C |
| `pubSignals` | `uint[9]` | The 9 public signals |

### Step 7 — Returned Object
For **registration:**
```json
{
  "pA": [...], "pB": [[...],[...]], "pC": [...], "pubSignals": [...],
  "commitmentHex": "0x...",
  "nullifierHex": "0x..."
}
```
For **voting:**
```json
{
  "pA": [...], "pB": [[...],[...]], "pC": [...], "pubSignals": [...],
  "nullifierHex": "0x...",
  "choiceCommitmentHex": "0x..."
}
```

---

## 7. Groth16 Verifier: Deployment & Wiring

### 7.1 `Groth16Verifier` Contract
Auto-generated by `snarkjs zkey export solidityverifier`. All VK constants are hard-coded as `uint256 constant`:
- `alphax`, `alphay` — $[\alpha]_1$
- `betax1/x2`, `betay1/y2` — $[\beta]_2$
- `gammax1/x2`, `gammay1/y2` — $[\gamma]_2$
- `deltax1/x2`, `deltay1/y2` — $[\delta]_2$
- `IC0x/y` through `IC9x/y` — 10 G1 IC points (IC0 + one per public signal)

**`verifyProof(uint[2] _pA, uint[2][2] _pB, uint[2] _pC, uint[9] _pubSignals) → bool`:**
Implemented in Solidity inline assembly using three EVM precompiles:
- Precompile 6 — BN128 point addition
- Precompile 7 — BN128 scalar multiplication (`g1_mulAccC`)
- Precompile 8 — BN128 pairing

**Algorithm:**
1. Validate each `_pubSignals[i]` is in the BN128 scalar field $r$
2. Compute linear combination: $vk_x = IC_0 + \sum_{i=0}^{8} s_i \cdot IC_{i+1}$ via repeated `g1_mulAccC` + point add
3. Groth16 pairing check: asserts $e(-A, B) \cdot e(\alpha, \beta) \cdot e(vk_x, \gamma) \cdot e(C, \delta) = 1$

### 7.2 Deployment

Managed by `smart-contract/migrations/3_deploy_verifier.js`:
```javascript
await deployer.deploy(Groth16Verifier);
const groth16Verifier = await Groth16Verifier.deployed();
const contract = await Contract.deployed();
await contract.setVoteVerifier(groth16Verifier.address);
```
Deployed at: `0x07971c3Fa3EbA3f0b6f6198598F09Bf80f1460fB` (as configured in `zkpConfig.js`).

Can also be re-wired manually via `smart-contract/set-verifier.js`:
```javascript
await contract.setVoteVerifier(verifierAddress, { from: admin });
```
Only the `admin` address can call `setVoteVerifier`. Guarded by an `onlyAdmin` modifier in `contract.sol`.

### 7.3 Interface in `contract.sol`

```solidity
interface IVoteVerifier {
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[9] calldata _pubSignals
    ) external view returns (bool);
}
```
State variable: `IVoteVerifier public voteVerifier;`

---

## 8. Voter Registration & Verification

### 8.1 Registration (No ZKP)

`dapp/src/pages/Register.js` calls `contract.registerVoter(name, normalizedIC, email)`.

On-chain: stores `keccak256(normalizedIC)` as `voter.icHash`, sets `status = 0` (PENDING). No ZKP at this stage — just identity data and an IC hash for later consistency checking.

### 8.2 Identity Verification (ZKP)

`dapp/src/pages/Verification.js`:

1. User uploads IC front image, IC back image, and selfie photo
2. All three are POSTed to `localhost:5000/verify` (Python Flask server running `backend/verification.py`)
   - **OCR:** EasyOCR extracts text from IC images; regex `\b(\d{6}-\d{2}-\d{4})\b` captures the IC number
   - **Face matching:** DeepFace/Facenet512 compares the IC front photo to the selfie (`enforce_detection=True`)
   - Returns `{ ic_number, ic_verified: true, face_matched: "verified" }`
3. Client calls `verifyICMatch(ocrIC, storedICHash)`: hashes OCR IC with `Web3.utils.soliditySha3` and compares to `voter.icHash` on-chain. Mismatch → error (OCR IC doesn't match what was registered)
4. `getVoterSecret(walletAddress)` retrieves or generates `voterSecret` from `localStorage`
5. **ZKP proof generated:** `generateRegistrationProof(ocrIC, walletAddress, voterSecret)` with `electionId = 0`, `candidateIndex = 0`, `numCandidates = 1`
6. `contract.verifyVoterWithZKP(pA, pB, pC, pubSignals)` submitted on-chain

### 8.3 On-Chain `verifyVoterWithZKP` Logic

```
require voter.status == 0 (PENDING)
require pubSignals[0] == 18
require pubSignals[2] == 0  (registration sentinel)
require pubSignals[3] != 0  (non-zero commitment)
require pubSignals[4/5/6] == _timestampToDate(block.timestamp)  (same-day check)
require voteVerifier.verifyProof(pA, pB, pC, pubSignals) == true  → else revert ProofFailed

voterCommitments[bytes32(pubSignals[3])] = true   // store commitment
voters[msg.sender].status = 1 (VERIFIED)
emit VoterCommitmentStored(commitment)
emit VoterVerified(msg.sender)
```

---

## 9. Candidate Registration & Verification

### 9.1 Registration (No ZKP)

`dapp/src/pages/CandidateRegister.js` calls `contract.registerCandidate(name, normalizedIC, email, party, manifesto)`. Same IC hash pattern as voter registration. Status set to PENDING.

### 9.2 Identity Verification (ZKP)

`dapp/src/pages/CandidateVerification.js`: Structurally identical flow to voter verification — OCR server, face matching, IC consistency check, ZKP proof generation with `electionId = 0`.

### 9.3 On-Chain `verifyCandidateWithZKP` Logic

Same validations as `verifyVoterWithZKP` for signals [0], [2], [3], [4/5/6], and the pairing check.

**Key difference from voter verification:**
- Does **not** store `voterCommitments[commitment] = true`
- Candidates are proven as valid persons (age/IC validity) but are **not issued a voting commitment**
- Sets `candidates[msg.sender].status = 1` (VERIFIED) and emits `CandidateVerified`

---

## 10. Vote Casting

### 10.1 Pre-Vote Double-Voting Check (Client-Side)

During `loadElections` in `dapp/src/pages/VoterElections.js`, for each election:
```javascript
const nullifier = await computeNullifier(voterSecret, electionId);
const nullifierBytes32 = toBytes32(nullifier);
const hasVoted = await contract.hasVoterVoted(electionId, nullifierBytes32);
```
Shows "✓ Vote Cast" in the UI without any on-chain write. The voter's identity is never queried.

### 10.2 Full Vote Casting Flow

`handleVote(electionId, candidateAddress, ic)`:

1. Fetch `publicKeyN` from contract; call `computeVoteBlock(totalVoters)` → $B$
2. `getCandidateIndex(election.candidates, candidateAddress)` → `candidateIndex`
3. `encryptVote(publicKeyN, candidateIndex, voteBlock)` → Paillier ciphertext (see Paillier doc)
4. `ipfsClient.uploadJSON({ election_id, encrypted_vote, vote_block, encryption_method: "Paillier-RadixPack" })` → `ipfsCID`
5. **ZKP:** `generateVoteProof(ic, walletAddress, voterSecret, electionId, candidateIndex, election.candidates.length)` → `{ pA, pB, pC, pubSignals, nullifierHex, choiceCommitmentHex }`
6. `contract.vote(electionId, ipfsCID, pA, pB, pC, pubSignals)`

### 10.3 On-Chain `vote` Logic

```
require election is open (startTime ≤ block.timestamp ≤ endTime)
require ipfsCID is non-empty
require paillierPublicKeyN is set
require voteVerifier is set

require pubSignals[2] == electionId
require pubSignals[0] == 18
require pubSignals[4/5/6] == _timestampToDate(block.timestamp)
require pubSignals[7] == getApprovedCandidates(electionId).length

nullifier = bytes32(pubSignals[1])
require !nullifierUsed[electionId][nullifier]   → else revert AlreadyVoted

require voterCommitments[bytes32(pubSignals[3])] == true  → else revert NotRegistered

require voteVerifier.verifyProof(pA, pB, pC, pubSignals)  → else revert ProofFailed

// Anonymous storage (no address → ballot link):
nullifierUsed[electionId][nullifier] = true
zkpVotes[electionId][nullifier] = ipfsCID
voteChoiceCommitments[electionId][nullifier] = bytes32(pubSignals[8])
zkpVoteNullifiers[electionId].push(nullifier)
election.totalVotes++

emit ZKPVoteCast(electionId, nullifier, choiceCommitment, block.timestamp)
```

The voter's wallet address is **never stored in relation to their nullifier or ballot CID**.

---

## 11. On-Chain Verification Logic

### 11.1 Groth16 Pairing Check (Inline Assembly)

The `Groth16Verifier.verifyProof` function:

1. **Field check:** Each `_pubSignals[i]` is verified to be less than the BN128 scalar field modulus $r = 21888242871839275222246405745257275088548364400416034343698204186575808495617$ via `lt` in assembly. Returns `false` on out-of-range.

2. **Linear combination:**
$$vk_x = IC_0 + \sum_{i=0}^{8} \text{pubSignals}[i] \cdot IC_{i+1}$$
Computed using precompile 7 (scalar mul) + precompile 6 (G1 point add).

3. **Pairing check via precompile 8:**
$$e(-A, B) \cdot e(\alpha, \beta) \cdot e(vk_x, \gamma) \cdot e(C, \delta) \stackrel{?}{=} 1$$
The four pairings are submitted in a single precompile 8 call (batched pairing). Returns `1` on success.

### 11.2 `_timestampToDate` (Gregorian Calendar)

Implemented in `contract.sol`. Converts `block.timestamp` (Unix seconds) to `(year, month, day)` using the standard Gregorian algorithm. This is the source of truth for the date signals — a proof generated at 23:59 UTC may expire at 00:00 UTC even within the same voting session.

### 11.3 Replay Protection Layers

| Layer | Mechanism | Reverts with |
|---|---|---|
| Same-day binding | `pubSignals[4/5/6]` vs `_timestampToDate(block.timestamp)` | (implicit date mismatch) |
| Election binding | `pubSignals[2]` vs `electionId` parameter | (implicit mismatch) |
| Double-vote | `nullifierUsed[electionId][nullifier]` | `AlreadyVoted` |
| Unverified voter | `voterCommitments[commitment]` | `NotRegistered` |
| Invalid proof | Groth16 pairing check | `ProofFailed` |
| Wrong age threshold | `pubSignals[0] != 18` | (implicit check) |
| Wrong candidate count | `pubSignals[7] != candidates.length` | (implicit check) |

---

## 12. Test Utilities

### `dapp/test-zkp.js`
Node.js ESM script (run with `node test-zkp.js`). Targets an **older** `agecheck` circuit (3-signal variant with `icHash` and `caller`), not the current `regCheck` 9-signal circuit. Used as a pipeline smoke-test:
- Loads `public/zkp/agecheck.wasm` and `public/zkp/agecheck_final.zkey` from the filesystem
- Runs `snarkjs.groth16.fullProve` with hardcoded IC `990101-01-1234` (born 1999, age 27 in 2026)
- Asserts `publicSignals[0] === '1'` (ageOk)
- Exports and logs Solidity calldata

### `smart-contract/verify-phase1.js`
Checks Phase 1 setup completeness: Paillier key set, trustees registered with share commitments, `trustee_shares/trustee_N.json` files present.

### `smart-contract/verify-phase2.js`
Checks Phase 2 readiness: Phase 1 complete, contract exposes `vote()` / `getZKPVote()` / `getZKPVoteNullifiers()` / `hasVoterVoted()`, at least one election created, nullifiers listable.

---

## 13. End-to-End ZKP Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│ REGISTRATION VERIFICATION (Voter or Candidate)                             │
│                                                                            │
│  User uploads IC front + back + selfie                                     │
│    │                                                                       │
│    ├─► POST localhost:5000/verify                                          │
│    │     EasyOCR extracts IC number from images                            │
│    │     DeepFace/Facenet512 matches IC photo to selfie                    │
│    │     returns { ic_number, ic_verified, face_matched }                  │
│    │                                                                       │
│    ├─► verifyICMatch: keccak256(ocrIC) == voter.icHash on-chain           │
│    │                                                                       │
│    ├─► voterSecret ← localStorage (or generate via window.crypto)         │
│    │                                                                       │
│    ├─► buildRegistrationCircuitInput:                                      │
│    │     ic[12], voterSecret, voterAddress, candidateIndex=0               │
│    │     ageThreshold=18, electionId=0, numCandidates=1                   │
│    │     nullifierHash    = Poseidon(voterSecret, 0)                       │
│    │     voterCommitment  = Poseidon(voterAddress, voterSecret)            │
│    │     currentYear/Month/Day from new Date().getUTC*()                  │
│    │     choiceCommitment = Poseidon(0, voterSecret, 0)                   │
│    │                                                                       │
│    ├─► fetch /zkp/regCheck.wasm + regCheck_final.zkey                     │
│    │     verify SHA-256 checksum                                           │
│    │                                                                       │
│    ├─► snarkjs.groth16.fullProve → { proof, publicSignals[9] }            │
│    │     (10–30 seconds, runs in-browser WASM)                             │
│    │                                                                       │
│    ├─► exportSolidityCallData → pA, pB, pC, pubSignals                   │
│    │                                                                       │
│    └─► contract.verifyVoterWithZKP(pA, pB, pC, pubSignals)               │
│             ├─ pubSignals[0] == 18                                         │
│             ├─ pubSignals[2] == 0 (sentinel)                               │
│             ├─ pubSignals[4/5/6] == block.timestamp date                  │
│             ├─ Groth16Verifier.verifyProof → BN254 pairing check          │
│             ├─ voterCommitments[pubSignals[3]] = true                     │
│             └─ voters[msg.sender].status = VERIFIED                       │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ VOTE CASTING                                                               │
│                                                                            │
│  Voter selects candidate → enters IC in modal                              │
│    │                                                                       │
│    ├─► encryptVote(publicKeyN, candidateIndex, voteBlock)                 │
│    │     Paillier: c = (n+1)^(B^i) · r^n mod n²                          │
│    │                                                                       │
│    ├─► IPFS upload { encrypted_vote, vote_block } → CID                  │
│    │                                                                       │
│    ├─► buildVoteCircuitInput:                                              │
│    │     ic[12], voterSecret, voterAddress, candidateIndex                │
│    │     ageThreshold=18, electionId (actual), numCandidates              │
│    │     nullifierHash    = Poseidon(voterSecret, electionId)              │
│    │     voterCommitment  = Poseidon(voterAddress, voterSecret)           │
│    │     currentYear/Month/Day from new Date().getUTC*()                  │
│    │     choiceCommitment = Poseidon(candidateIndex, voterSecret, electionId)│
│    │                                                                       │
│    ├─► snarkjs.groth16.fullProve → { proof, publicSignals[9] }            │
│    │                                                                       │
│    └─► contract.vote(electionId, ipfsCID, pA, pB, pC, pubSignals)        │
│             ├─ election open check                                         │
│             ├─ pubSignals[0] == 18                                         │
│             ├─ pubSignals[2] == electionId                                │
│             ├─ pubSignals[4/5/6] == block.timestamp date                  │
│             ├─ pubSignals[7] == approvedCandidates.length                 │
│             ├─ !nullifierUsed[electionId][nullifier]                      │
│             ├─ voterCommitments[pubSignals[3]] == true                    │
│             ├─ Groth16Verifier.verifyProof → BN254 pairing check          │
│             ├─ zkpVotes[electionId][nullifier] = CID  (anonymous)         │
│             ├─ voteChoiceCommitments[electionId][nullifier] = choice      │
│             └─ emit ZKPVoteCast(electionId, nullifier, choice, ts)        │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Source Files Reference

| File | Role |
|---|---|
| `circuits/regCheck.circom` | Circom 2.0 circuit: 4 private inputs, 9 public signals |
| `dapp/src/utils/zkpProofGenerator.js` | Browser-side proof generation orchestrator |
| `dapp/src/utils/zkpArtifactLoader.js` | WASM + zkey fetch with SHA-256 integrity check |
| `dapp/src/config/zkpConfig.js` | Artifact paths and SHA-256 checksum |
| `dapp/src/utils/poseidonUtils.js` | `computeCommitment`, `computeNullifier`, `computeChoiceCommitment`, `generateVoterSecret` |
| `dapp/src/utils/icHashUtils.js` | IC normalization and `keccak256` IC hash utilities |
| `dapp/public/zkp/regCheck.wasm` | Circom witness calculator (WebAssembly) |
| `dapp/public/zkp/regCheck_final.zkey` | Groth16 proving key |
| `smart-contract/contracts/Verifier.sol` | Auto-generated Groth16 verifier (VK constants hard-coded) |
| `smart-contract/contracts/contract.sol` | `verifyVoterWithZKP`, `verifyCandidateWithZKP`, `vote`, `_timestampToDate` |
| `smart-contract/migrations/3_deploy_verifier.js` | Deploys `Groth16Verifier` and wires to main contract |
| `smart-contract/set-verifier.js` | Manual re-wiring of verifier address |
| `smart-contract/verification_key.json` | Off-chain verification key (snarkjs verify) |
| `dapp/test-zkp.js` | Pipeline smoke-test (targets older `agecheck` circuit) |
| `smart-contract/verify-phase1.js` | Phase 1 completeness check script |
| `smart-contract/verify-phase2.js` | Phase 2 readiness check script |
