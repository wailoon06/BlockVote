# BlockVote Security & Audit Fixes

This document outlines the three major vulnerabilities and execution bugs that were recently addressed in the BlockVote system. It details the nature of each bug, the potential attack vectors they exposed, and the specific mitigation strategies implemented to resolve them.

---

## 1. Mempool Front-Running Vulnerability (ZKP Replay Attack)

### The Bug
In the original implementation, the generated Zero-Knowledge Proof (ZKP) for a vote authenticated the voter's identity and uniqueness (preventing double voting) but **did not cryptographically bind to the actual vote payload** (the `ipfsCID`). 

### Possible Attack
Because the ZKP was isolated from the `ipfsCID`, a malicious observer could monitor the Ethereum Mempool for pending vote transactions. The attacker could:
1. Intercept a legitimate voter's transaction before it is mined.
2. Copy the valid Groth16 Zero-Knowledge Proof.
3. Replace the original `ipfsCID` containing the legitimate vote with their own `ipfsCID` (voting for the attacker's preferred candidate).
4. Broadcast the modified transaction with a higher gas fee. 
The smart contract would accept the hijacked vote as mathematically valid, completely stealing the user's vote and locking them out of the election (since their nullifier is now spent).

### How It Was Solved
We implemented **Cryptographic Payload Binding**. 
* Modified the `regCheck.circom` circuit to accept the `ipfsCID` payload natively.
* Added a dummy constraint (`payloadSquare = payload * payload`) to force the generic payload integer into the heart of the Zero-Knowledge signature.
* Updated `VoterElections.js` to convert the IPFS CID into a scalar value and inject it into the `generateVoteProof()` function.
* With this fix, altering the `ipfsCID` in transit completely shatters the ZK verification, causing the smart contract to instantly reject hijacked transactions.

---

## 2. Smart Contract Parameter Mismatch (The `Line 499` Array Bug)

### The Bug
When the circuit was upgraded to mitigate the Mempool Front-Running attack (adding the new `payload` parameter), the size of the SNARK's public signals array increased from 9 inputs to 10 inputs (`uint[10]`). However, the smart contract's anonymous registration functions (`verifyVoterWithZKP` and `verifyCandidateWithZKP`) were still hardcoded to expect `uint[9] calldata`.

### Possible Attack / Impact
While not an active attack vector by a malicious actor, this was a critical system-breaking bug triggered by our own security upgrades. It completely bricked the DApp. Legitimate users attempting to register as Voters or Candidates would experience reverted blockchain transactions, rendering the entire system unusable because the Solidity compiler rejected the incoming arrays length.

### How It Was Solved
* Re-audited `contract.sol` to identify all functions utilizing the legacy circuit validator.
* Upgraded the expected array bounds in `_validateRegZKPSignals`, `verifyVoterWithZKP`, and `verifyCandidateWithZKP` to `uint[10]`.
* Cleaned up the frontend deployment variables in `dapp/src/config/zkpConfig.js` to ensure the new `.zkey` and `.wasm` artifacts correctly matched the upgraded smart contract parameters, fully restoring DApp operability.

---

## 3. Trustee Denial of Service (DoS) via Invalid Partial Decryptions

### The Bug
In the threshold Paillier cryptosystem, combining the final tally requires partial decryptions from the appointed Trustees. The original system assumed Trustees were honest and simply concatenated any partial decryption (`PD_i`) they submitted.

### Possible Attack
A **Malicious Trustee** could intentionally act as a saboteur. Instead of computing the correct partial decryption using their private key share `s_i`, the rogue Trustee could submit random mathematical gibberish (e.g., `PD_i = 1234567`). 
Because the math homomorphically combines all the shares, a single corrupted partial decryption pollutes the mathematical pool. When the Organizer attempts to combine and decrypt the final tally, it results in complete nonsense. The election outcome is permanently destroyed, causing a complete system Denial of Service (DoS) with no way to identify who corrupted it.

### How It Was Solved
We implemented **Chaum-Pedersen Non-Interactive Zero-Knowledge Proofs (NIZK)** of discrete logarithm equality.
* **Setup Phase Enhancement:** In `phase1-setup.js`, we generate a globally deterministic random generator $v$ and calculate Public Verification Shares ($V_i = v^{s_i} \pmod{n^2}$) for every Trustee, publishing them to `verification_shares.json`.
* **Trustee Submission:** Before submitting their partial decryption in `TrusteeDashboard.js`, the code now executes `generateDecryptionProof()`. It uses the Trustee's private share to generate a mathematically unforgeable cryptographic proof (with boundaries `z` and `e`) proving the payload is authentic without revealing the private key.
* **Organizer Verification Failsafe:** In `OrganizerManageElection.js`, when combining the partial decryptions, the system now runs `verifyDecryptionProof()` against every Trustee's submission. If a malicious Trustee submits a garbage payload, the math instantly catches it (`Malicious Partial Decryption detected.`), drops their malicious share, and successfully protects the integrity of the Election.