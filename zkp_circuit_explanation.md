# Groth16 zk-SNARKs: Circuit Logic and Verification Flow

This document details the architectural flow, circuit logic, signal mappings, and mathematical verification behind the Groth16 Zero-Knowledge Proof system used in this architecture.

## 1. Circuit Logic (`regCheck.circom`)
The underlying circuit (`regCheck.circom`) uses a Rank-1 Constraint System (R1CS) to mathematically prove the integrity of the voting process without revealing the underlying sensitive data. The primary logic enforces:
* **Eligibility & Range Checks**: Verifying credentials mathematically (e.g., ensuring an identity satisfies the `ageThreshold` against current clock parameters and that the `candidateIndex` is within `numCandidates`).
* **Identity Hiding**: Processing personal identifiers (like National IDs) exclusively on the client side, emitting only cryptographic commitments via hashing.
* **Payload Binding**: Cryptographically tying the anonymous vote payload to the generated proof to prevent replay attacks and transaction interception (Mempool Front-Running).

## 2. Public Signals Mapping & Nullifiers
The circuit safely isolates private inputs and evaluates them alongside on-chain public signals.

### Private Inputs (Witnesses - Client-Side Only)
* `ic[12]`: The physical identity number.
* `voterSecret`: A locally generated random scalar binding the session for this specific vote.
* `voterAddress`: The Ethereum wallet address.
* `candidateIndex`: The chosen candidate's numerical index.

### Public Signals Mapping
These elements are exposed to the blockchain for public verification:
1. `ageThreshold`: Fixed boundary constraints (e.g., 18).
2. **`nullifierHash`**: Computed as `Poseidon(voterSecret, electionId)`. This acts as the **core nullifier** to prevent double voting. The smart contract ensures each nullifier is used exactly once per election. Because it is hashed, it cannot be reverse-engineered back to the voter.
3. `electionId`: The target election smart contract ID.
4. `voterCommitment`: `Poseidon(voterAddress, voterSecret)`. Binds the generated proof to the caller's wallet so it cannot be stolen in the mempool.
5. `currentYear`, `currentMonth`, `currentDay`: Clock parameters passed from the blockchain block timestamp.
6. `numCandidates`: Asserts `candidateIndex` limitations to prevent invalid candidate voting.
7. `choiceCommitment`: `Poseidon(candidateIndex, voterSecret, electionId)`. Locks the cryptographic operation down to the specific choice.
8. `payloadHash`: Strongly binds the proof to the outer transaction payload (e.g., IPFS CID) preventing tampering on the wire.

## 3. Off-Chain Proof Generation
The generation of the Groth16 proof is highly compute-intensive and runs strictly within the user's isolated environment.

**Generation Flow:**
1. The frontend (`dapp/src/utils/zkpProofGenerator.js`) formulates the necessary public signals and private witness data.
2. Heavy cryptographic operations are often passed to background Web Workers to maintain UI responsiveness.
3. The `snarkjs` library uses the WebAssembly (WASM) prover alongside the compiled R1CS to compute the Groth16 mathematical proofs representing the inputs.
4. The generated proof tuples (`pi_a`, `pi_b`, `pi_c`) are formatted to match the Solidity verifier's expected parameter types.

## 4. On-Chain Verifier (Flow & Mathematics)

### Verification Flow
1. **Submission**: The React application submits a transaction containing the proof (`pi_a`, `pi_b`, `pi_c`) and the 10 public signals.
2. **Replay Check**: The primary smart contract (`Verifier.sol` / `Contract.sol`) cross-references the `nullifierHash` against a mapping of used nullifiers. If it exists, the transaction reverts.
3. **Execution**: The contract passes the variables to the auto-generated `Groth16Verifier`, which mathematically checks the proof.
4. **State Commitment**: If validation succeeds, the `nullifierHash` is permanently logged into the state, marking the identity as "voted", and the encrypted vote payload is accepted into the election pool.

### Mathematics
The Groth16 verifier relies heavily on properties of Elliptic Curve Cryptography (ECC), specifically utilizing the **alt_bn128** curve, which is natively precompiled in Ethereum implementations to reduce gas costs.

The circuit utilizes **Poseidon** hashing because it is highly "algebraically friendly," drastically condensing the constraint size of the circuit compared to traditional hashing algorithms like SHA-256.

Ultimately, the Ethereum smart contract evaluates the proof over the optimal Ate pairing using this specific bilinear pairing equation:

$$e(A, B) = e(\alpha, \beta) \cdot e\left(\sum_{i=0}^l public_i \cdot \frac{G_i}{\gamma}, \gamma\right) \cdot e(C, \delta)$$

**Where:**
* $e$ evaluates the optimal Ate pairing function.
* $A, B, C$ are the exact proof elements submitted by the voter.
* $\alpha, \beta, \gamma, \delta$, and $G_i$ are derived verification keys fixed during the Phase-1 Trusted Setup (`regCheck_final.zkey`).
* $public_i$ are the public signals mapped as specific scalar elements within the finite field of the curve.
