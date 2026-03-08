# BlockVote — Technical Overview

## Table of Contents
1. [System Architecture](#1-system-architecture)
2. [User Roles & Capabilities](#2-user-roles--capabilities)
3. [Smart Contract: `contract.sol`](#3-smart-contract-contractsol)
4. [Election Lifecycle](#4-election-lifecycle)
5. [On-Chain Data Storage](#5-on-chain-data-storage)
6. [IPFS Integration](#6-ipfs-integration)
7. [Frontend Architecture](#7-frontend-architecture)
8. [Deployment Process](#8-deployment-process)
9. [Backend Services (Python)](#9-backend-services-python)
10. [Role Assignment & User Onboarding](#10-role-assignment--user-onboarding)
11. [Election Creation & Management](#11-election-creation--management)
12. [Candidate Application & Approval](#12-candidate-application--approval)
13. [End-to-End Voting Flow](#13-end-to-end-voting-flow)
14. [Results Computation & Publication](#14-results-computation--publication)
15. [Cryptographic Subsystems (Summary)](#15-cryptographic-subsystems-summary)
16. [Contract: Custom Errors](#16-contract-custom-errors)
17. [Contract: Events](#17-contract-events)

---

## 1. System Architecture

BlockVote is a decentralised e-voting platform structured across four layers:

```
┌──────────────────────────────────────────────────────────────┐
│                  Frontend (React + Vite)                      │
│  dapp/ — React 19, React Router 7, Web3 4.x, snarkjs 0.7     │
│  Communicates with MetaMask (window.ethereum) + IPFS Desktop  │
└─────────────────────────┬────────────────────────────────────┘
                          │ JSON-RPC (Web3.js)
┌─────────────────────────▼────────────────────────────────────┐
│               Local Blockchain (Ganache :7545)                │
│  smart-contract/ — Truffle 5, Solidity 0.8.19                │
│  Contract.sol  +  Groth16Verifier.sol (snarkjs output)        │
└─────────────────────────┬────────────────────────────────────┘
                          │ HTTP API
┌─────────────────────────▼────────────────────────────────────┐
│         Decentralised Storage (IPFS Desktop :5001)            │
│  Encrypted ballots uploaded as JSON; CID stored on-chain      │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│              Backend Crypto Services (Python)                 │
│  backend/ — Paillier key-gen, Shamir sharing, aggregation,    │
│             identity verification (Flask + EasyOCR + DeepFace)│
└──────────────────────────────────────────────────────────────┘
```

**Core design principles:**

| Principle | Implementation |
|---|---|
| **Anonymity** | Votes are keyed by a ZKP nullifier (`Poseidon(voterSecret, electionId)`), never by wallet address |
| **Confidentiality** | Ballots are Paillier-encrypted client-side before upload to IPFS |
| **Verifiability** | Every `vote()` call is validated by an on-chain Groth16 ZKP verifier |
| **Threshold decryption** | Results cannot be decrypted by any single party; a quorum of 2-of-3 trustees must collaborate |
| **Integrity** | Homomorphic tally hash covers all cast CIDs; organizer cannot silently drop votes |

---

## 2. User Roles & Capabilities

Four roles exist. A single wallet address can hold **at most one role**.

### 2.1 Admin
Automatically assigned to `accounts[0]` (the deployer) in the constructor.

- Approve or reject organiser applications via `verifyOrganizer(address)`
- Set the Paillier public key: `setPaillierPublicKey(string)` (one-time)
- Wire the ZKP verifier contract: `setVoteVerifier(address)`
- View all users (`AllUsers`) and platform statistics (`AdminPanel`)
- Submit decryption shares and publish results on any election

### 2.2 Organizer
Registers via `registerOrganizer(name, email, description)`. Begins `PENDING`; becomes `APPROVED` only after admin approval.

- Create elections with a four-window timeline
- View and manage all own elections (`OrganizerDashboard`)
- Approve or reject candidate applications
- Trigger Phase 3 homomorphic tally aggregation after voting closes
- Load trustee share files and execute Phase 4 threshold decryption
- Publish decrypted results on-chain

### 2.3 Candidate
Registers via `registerCandidate(name, ic, email, party, manifesto)`. Must pass ZKP age-verification to become `VERIFIED`.

- Browse all elections and apply during the nomination window
- View own application status across elections
- View own dashboard statistics

### 2.4 Voter
Registers via `registerVoter(name, ic, email)`. Must pass ZKP age-verification to become `VERIFIED` and have a `voterCommitment` stored on-chain.

- Browse open elections and cast an anonymous encrypted vote
- Check "already voted" status client-side without revealing identity
- View election results after publication

---

## 3. Smart Contract: `contract.sol`

**Compiler:** Solidity `0.8.19`, optimizer `runs: 1`, `viaIR: true`, EVM version `london`.

### 3.1 Structs

#### `Trustee`
| Field | Type | Description |
|---|---|---|
| `walletAddress` | `address` | Trustee's wallet |
| `shareCommitment` | `bytes32` | `keccak256` of the secret share |
| `hasSubmittedCommitment` | `bool` | One-time guard |
| `registeredAt` | `uint256` | Unix timestamp |

#### `Voter`
| Field | Type | Description |
|---|---|---|
| `wallet` | `address` | Voter wallet |
| `name` | `string` | Display name |
| `icHash` | `bytes32` | `keccak256(ic)` — IC number never stored plaintext |
| `email` | `string` | Email address |
| `status` | `uint8` | `0` = PENDING_VERIFICATION, `1` = VERIFIED |
| `verificationCode` | `bytes32` | `keccak256(wallet, name, ic, email, timestamp)` |
| `registeredAt` | `uint256` | Unix timestamp |
| `verifiedAt` | `uint256` | Unix timestamp |
| `isRegistered` | `bool` | Existence flag |

#### `Candidate`
Same fields as `Voter`, plus `party` (`string`) and `manifesto` (`string`).

#### `Organizer`
| Field | Type | Description |
|---|---|---|
| `wallet` | `address` | Organizer wallet |
| `organizationName` | `string` | Organization display name |
| `email` | `string` | Email address |
| `description` | `string` | Organization description |
| `status` | `uint8` | `0` = PENDING, `1` = APPROVED, `2` = REJECTED |
| `registeredAt` | `uint256` | Unix timestamp |
| `isRegistered` | `bool` | Existence flag |

#### `Election`
| Field | Type | Description |
|---|---|---|
| `id` | `uint256` | Auto-incremented |
| `title` | `string` | Election title |
| `description` | `string` | Description |
| `organizer` | `address` | Creator address |
| `nominationStartTime` | `uint256` | Unix timestamp |
| `nominationEndTime` | `uint256` | Unix timestamp |
| `startTime` | `uint256` | Voting open |
| `endTime` | `uint256` | Voting close |
| `isActive` | `bool` | Always `true` after creation |
| `createdAt` | `uint256` | Unix timestamp |
| `totalVotes` | `uint256` | Incremented on each `vote()` |
| `encryptedTally` | `string` | Phase 3: JSON blob of Paillier aggregate |
| `tallyStored` | `bool` | Phase 3 complete flag |
| `decryptedResult` | `string` | Phase 4: JSON-encoded per-candidate counts |
| `resultsPublished` | `bool` | Phase 4 complete flag |

---

### 3.2 Key State Variables

| Variable | Type | Purpose |
|---|---|---|
| `admin` | `address` | Contract owner (deployer) |
| `paillierPublicKeyN` | `string` | Paillier modulus N (1024-bit, stored as decimal string) |
| `isPaillierKeySet` | `bool` | One-time set guard |
| `trusteeAddresses` | `address[]` | Ordered list of trustee wallets |
| `trustees` | `mapping(address → Trustee)` | Trustee struct lookup |
| `threshold` | `uint256` | Minimum trustees needed for decryption (2) |
| `voters` / `candidates` / `organizers` | `mapping(address → struct)` | Per-role records |
| `elections` | `mapping(uint256 → Election)` | Election data by ID |
| `electionCounter` | `uint256` | Auto-increment election ID |
| `usedICs` / `usedEmails` | `mapping(bytes32/string → bool)` | Global deduplication |
| `voterCommitments` | `mapping(bytes32 → bool)` | Poseidon commitments stored at ZKP verification |
| `nullifierUsed` | `mapping(uint256 → mapping(bytes32 → bool))` | Per-election double-vote prevention |
| `zkpVotes` | `mapping(uint256 → mapping(bytes32 → string))` | `nullifier → IPFS CID` (anonymous) |
| `voteChoiceCommitments` | `mapping(uint256 → mapping(bytes32 → bytes32))` | `nullifier → choiceCommitment` |
| `zkpVoteNullifiers` | `mapping(uint256 → bytes32[])` | Ordered nullifier list per election |
| `voteVerifier` | `IVoteVerifier` | Groth16 verifier contract |
| `candidateApplicationStatus` | `mapping(uint256 → mapping(address → uint8))` | `0`=none, `1`=pending, `2`=approved, `3`=rejected |

---

### 3.3 Modifiers

| Modifier | Condition |
|---|---|
| `onlyAdmin()` | `msg.sender != admin` → revert `NotAdmin` |
| `onlyTrustee()` | No trustee record → revert `NotTrustee` |

---

### 3.4 Functions by Phase/Role

#### Phase 1 — Paillier & Trustee Setup

| Function | Caller | Description |
|---|---|---|
| `setPaillierPublicKey(string)` | Admin | Stores modulus N; one-time only (`AlreadyKeySet`) |
| `getPaillierPublicKey()` | Anyone | Returns N; reverts `KeyNotSet` if not yet set |
| `submitShareCommitment(bytes32)` | Trustee | Locks `keccak256("x:y")` commitment once per trustee |
| `allTrusteesCommitted()` | View | True when all trustees have committed |
| `setVoteVerifier(address)` | Admin | Wires the deployed `Groth16Verifier` |
| `getTrusteeInfo(address)` / `getTrusteeAddresses()` | View | Trustee inspection |

#### Registration & Verification

| Function | Caller | Description |
|---|---|---|
| `registerVoter(name, ic, email)` | User | Creates voter record; checks IC + email uniqueness |
| `verifyVoterWithZKP(pA, pB, pC, pubSignals)` | Voter | Validates Groth16 proof; stores `voterCommitment`; sets `status=1` |
| `registerCandidate(name, ic, email, party, manifesto)` | User | Creates candidate record |
| `verifyCandidateWithZKP(pA, pB, pC, pubSignals)` | Candidate | Same ZKP checks as voter (but does **not** store `voterCommitment`) |
| `registerOrganizer(orgName, email, description)` | User | Creates organizer in `PENDING` state |
| `verifyOrganizer(address)` | Admin | Sets organizer `status=1` (APPROVED) |
| Various `getXInfo`, `isXRegistered`, `getAllX` | View | Introspection helpers |

#### Election Management

| Function | Caller | Description |
|---|---|---|
| `createElection(title, desc, nomStart, nomEnd, start, end)` | Approved Organizer | Creates election; enforces strict time ordering |
| `applyToElection(electionId)` | Verified Candidate | Registers candidacy during nomination window |
| `approveCandidateForElection(id, wallet)` | Organizer / Admin | Approves applicant before `startTime` |
| `rejectCandidateForElection(id, wallet)` | Organizer / Admin | Rejects applicant before `startTime` |
| `getApprovedCandidates(id)` | View | Returns only `status=2` applicant addresses |

#### Phase 2 — ZKP Encrypted Voting

| Function | Caller | Description |
|---|---|---|
| `vote(electionId, ipfsCID, pA, pB, pC, pubSignals)` | Verified Voter | Core vote function — 11-step validation, then anonymous storage |
| `hasVoterVoted(electionId, nullifier)` | View | Check via nullifier — no address revealed |
| `getZKPVote(electionId, nullifier)` | View | Returns IPFS CID for a nullifier |
| `getZKPVoteNullifiers(electionId)` | View | All nullifiers for tally aggregation |
| `getChoiceCommitment(electionId, nullifier)` | View | Ballot choice audit helper |

#### Phase 3 — Encrypted Tally

| Function | Caller | Description |
|---|---|---|
| `storeEncryptedTally(electionId, encryptedTallyJSON, tallyInputHash)` | Admin / Organizer | Stores homomorphic aggregate; verifies `keccak256` of all CIDs matches `tallyInputHash`; requires `now > endTime` |
| `getEncryptedTally(id)` | View | Returns `(encryptedTally, totalVotes, tallyStored)` |

#### Phase 4 — Threshold Decryption & Results

| Function | Caller | Description |
|---|---|---|
| `submitDecryptionShare(electionId, shareHash)` | Admin / Trustee | Records trustee participation |
| `publishResults(electionId, decryptedResultJSON)` | Admin / Organizer | Persists per-candidate vote counts; sets `resultsPublished=true` |
| `getResults(id)` | View | Returns `(json, resultsPublished, shareCount)` |

---

## 4. Election Lifecycle

Each election passes through phases determined by `block.timestamp` and two boolean flags.

```
 nominationStart   nominationEnd    startTime        endTime
       │                │               │               │
  ─────┼────────────────┼───────────────┼───────────────┼──────►
       │                │               │               │
  Upcoming  │ NOMINATING │ Awaiting Vote │ VOTING OPEN   │ Ended
            │            │               │               │
            │ candidates │  organizer    │  vote()       │
            │ apply      │  approves /   │  accepted     │
            │            │  rejects      │               │
            └────────────┴───────────────┴───────────────┘
                                                          │
                                              Phase 3: organizer aggregates
                                              → storeEncryptedTally()
                                              → tallyStored = true
                                                          │
                                              Phase 4: load ≥2 trustee shares
                                              → submitDecryptionShare() × N
                                              → publishResults()
                                              → resultsPublished = true
```

**Client-side status labels:**

| Label | Condition |
|---|---|
| `Upcoming` | `now < nominationStartTime` |
| `Nominating` | `nominationStartTime ≤ now ≤ nominationEndTime` |
| `Awaiting Voting` | `nominationEndTime < now < startTime` |
| `Voting Ongoing` | `startTime ≤ now ≤ endTime` |
| `Completed` | `now > endTime` |

---

## 5. On-Chain Data Storage

### Stored on-chain

| Data | Location | Notes |
|---|---|---|
| Voter / Candidate / Organizer records | `voters[wallet]`, `candidates[wallet]`, `organizers[wallet]` | IC stored as `keccak256` hash only |
| Paillier modulus N | `paillierPublicKeyN` | Full decimal string (~310 digits) |
| Trustee share commitments | `trustees[wallet].shareCommitment` | Hash only; actual shares live off-chain |
| Voter Poseidon commitments | `voterCommitments[commitment]` | Written once at ZKP verification; boolean map |
| Election structs | `elections[id]` | Full timeline, flags, tally, result JSON |
| ZKP vote records | `zkpVotes[id][nullifier]` = CID | Wallet-address-free |
| Choice commitments | `voteChoiceCommitments[id][nullifier]` | Audit only |
| Nullifier usage | `nullifierUsed[id][nullifier]` | Boolean; double-vote guard |
| Encrypted tally | `elections[id].encryptedTally` | Paillier aggregate ciphertext JSON |
| Decrypted result | `elections[id].decryptedResult` | Per-candidate vote counts JSON |

### NOT stored on-chain

| Data | Where instead |
|---|---|
| IC number plaintext | Never persisted anywhere — only its `keccak256` |
| Voter secret | Browser `localStorage` only |
| Encrypted ballot payloads | IPFS — only CID is on-chain |
| Trustee secret shares (y values) | `trustee_shares/trustee_N.json` (AES-encrypted) |

---

## 6. IPFS Integration

### Node
Both the browser client (`dapp/src/utils/ipfsClient.js`) and aggregation scripts (`smart-contract/ipfs-manager.js`) target the local IPFS Desktop daemon at `http://127.0.0.1:5001`.

| Endpoint | Purpose |
|---|---|
| `POST /api/v0/add` | Upload encrypted ballot JSON |
| `POST /api/v0/pin/add?arg=<CID>` | Pin to prevent garbage collection |
| `POST /api/v0/cat?arg=<CID>` | Retrieve ballot for Phase 3 aggregation |
| `POST /api/v0/version` | Liveness / CORS check |

### Stored ballot JSON structure
```json
{
  "election_id": 1,
  "encrypted_vote": "<Paillier ciphertext — decimal string>",
  "vote_block": "<radix B — decimal string>",
  "encryption_method": "Paillier-RadixPack"
}
```

### CID lifecycle
1. **Vote:** Voter uploads ballot to IPFS → CID returned → `contract.vote(..., ipfsCID, ...)`
2. **Phase 3:** Organizer iterates `getZKPVoteNullifiers(id)` → resolves CID per nullifier → fetches ballot from IPFS → homomorphic multiply all ciphertexts → `storeEncryptedTally(electionId, result, tallyInputHash)`
3. **Integrity:** `tallyInputHash = keccak256(CID_0 ‖ CID_1 ‖ … ‖ CID_n)` is verified on-chain — organizer cannot silently drop any ballot

---

## 7. Frontend Architecture

**Stack:** React 19, React Router v7, Vite 7, Web3 4.x, snarkjs 0.7, circomlibjs 0.1, `vite-plugin-node-polyfills` (Buffer/process shims).

### 7.1 Routing

| Route | Component | Role |
|---|---|---|
| `/` | `Home` | Landing / wallet connect / role dispatch |
| `/register` | `Register` | Voter registration form |
| `/verify` | `Verification` | Voter ZKP identity verification |
| `/candidate-register` | `CandidateRegister` | Candidate registration |
| `/candidate-verify` | `CandidateVerification` | Candidate ZKP verification |
| `/candidate-dashboard` | `CandidateDashboard` | Candidate overview stats |
| `/candidate-elections` | `CandidateElections` | Browse & apply to elections |
| `/candidate-my-elections` | `CandidateMyElections` | View own applications |
| `/voter-dashboard` | `VoterDashboard` | Voter overview stats |
| `/voter-elections` | `VoterElections` | Browse open elections & vote |
| `/organizer-register` | `OrganizerRegister` | Organizer registration |
| `/organizer-dashboard` | `OrganizerDashboard` | Election list + create new |
| `/organizer-manage-election` | `OrganizerManageElection` | Per-election management (Phase 3 & 4) |
| `/admin` | `AdminPanel` | Admin control panel |
| `/election-results` | `ElectionResults` | Results display (post-Phase 4) |
| `/users` | `AllUsers` | Admin-only full user table |

### 7.2 Pages by Role

#### Admin
- **`AdminPanel`** — Platform statistics, pending organizer approval queue, "Approve" button per applicant.
- **`AllUsers`** — Searchable table of every registered wallet with status badges and timestamps.

#### Organizer
- **`OrganizerRegister`** — Calls `registerOrganizer`; shows PENDING notice.
- **`OrganizerDashboard`** — Lists own elections with computed status badges; modal form to create new election (datetime inputs converted to Unix timestamps; local + on-chain ordering validation).
- **`OrganizerManageElection`** — Candidate applicant list with Approve/Reject buttons; auto-triggers Phase 3 aggregation when `endTime` passes; Phase 4 trustee file picker + passphrase inputs for threshold decryption.
- **`ElectionResults`** — Candidate vote counts, percentages, and bar-chart after `resultsPublished=true`.

#### Candidate
- **`CandidateRegister`** / **`CandidateVerification`** — Registration + ZKP proof.
- **`CandidateElections`** — Browse elections; "Apply" active only during nomination window.
- **`CandidateMyElections`** — Two tabs: pending/rejected applications, and approved elections.
- **`CandidateDashboard`** — Profile card + application statistics.

#### Voter
- **`Register`** / **`Verification`** — Registration + ZKP proof; `voterSecret` stored in `localStorage`.
- **`VoterElections`** — Open elections; clicking "Vote" opens an **IC Confirmation Modal** (IC is used for ZKP proof generation only — never sent on-chain).
- **`VoterDashboard`** — Profile card + election statistics.

### 7.3 Shared Components

| Component | Description |
|---|---|
| `Navbar` | Fixed top bar; wallet address badge; role-specific profile dropdown |
| `Sidebar` | Collapsible icon rail (70px) expanding to 240px on hover; role-specific navigation |
| `RoleSelectionModal` | Fullscreen overlay for new wallets to choose their role |
| `MessageAlert` | Auto-dismissing toast (2–3 s) |
| `DashboardLayout` | Wrapper layout helper |

### 7.4 Utility Modules

| Module | Role |
|---|---|
| `contractUtils.js` | `getWeb3()`, `getDeployedContract()` — resolves contract against network ID |
| `ipfsClient.js` | `uploadJSON`, `retrieveJSON`, `pin`, `getGatewayUrl` against IPFS Desktop API |
| `voteEncryption.js` | `encryptVote`, `computeVoteBlock`, `getCandidateIndex` |
| `zkpProofGenerator.js` | `generateVoteProof`, `generateRegistrationProof` — calls `snarkjs.groth16.fullProve` |
| `poseidonUtils.js` | `computeCommitment`, `computeNullifier`, `computeChoiceCommitment`, `generateVoterSecret` |
| `homomorphicAggregator.js` | Phase 3: client-side Paillier homomorphic addition |
| `thresholdDecryption.js` | Phase 4: `decryptShareY`, `reconstructSecret` (Lagrange BigInt), `paillierDecrypt`, `extractVoteCounts` |
| `icHashUtils.js` | IC normalization and `keccak256` hash comparison |
| `zkpArtifactLoader.js` | Lazy-loads `regCheck.wasm` and `regCheck_final.zkey` with SHA-256 integrity check |

---

## 8. Deployment Process

### 8.1 Prerequisites

| Service | Address |
|---|---|
| Ganache | `127.0.0.1:7545`, network ID `5777` |
| IPFS Desktop | `127.0.0.1:5001` (HTTP API) |
| Python venv | `venv/` at project root |

### 8.2 Truffle Configuration

- Network: `development` — `127.0.0.1:7545`, `network_id: *`
- Solidity `0.8.19`, optimizer `runs: 1`, `viaIR: true`, `evmVersion: london`

### 8.3 Migration Scripts

| File | What it deploys |
|---|---|
| `smart-contract/migrations/2_migrate.js` | `Contract` with `trusteeAddresses = [accounts[1], accounts[2], accounts[3]]`, `threshold = 2`. `accounts[0]` becomes `admin`. |
| `smart-contract/migrations/3_deploy_verifier.js` | `Groth16Verifier` (compiled from `Verifier.sol`). Immediately wires via `contract.setVoteVerifier(verifier.address)`. |

### 8.4 `deploy.ps1` — Full Deployment Script

| Step | Action |
|---|---|
| 1 | `truffle migrate --reset --network development` |
| 2 | `truffle exec set-verifier.js` — confirms verifier linkage |
| 2.5 | `node phase1-setup.js` — generates Paillier keypair, splits secret into Shamir shares, calls `setPaillierPublicKey` + `submitShareCommitment` per trustee, writes `trustee_shares/trustee_N.json` |
| 3 | Copies `Contract.json` → `dapp/src/contract.json` and `Groth16Verifier.json` → `dapp/src/Verifier.json` |
| 4 | Reads deployed contract addresses from copied JSON |
| 5 | Patches verifier address into `dapp/src/config/zkpConfig.js` |
| 6 | Reads Paillier public key from blockchain; prints deployment summary |

### 8.5 `health-check.js`

Runs 9 sequential checks: Ganache connection → `Contract.json` existence → Paillier key set → trustee commitments → Phase 2 function presence → sufficient test accounts → `contract.json` in dApp → backend Python files present → IPFS availability (warning).

---

## 9. Backend Services (Python)

All modules in `backend/` are **standalone scripts**, not a persistent service, except `verification.py` which runs as a Flask server.

| File | Purpose |
|---|---|
| `paillier_crypto.py` | Paillier keypair generation, encrypt, decrypt (1024-bit) |
| `shamir_sharing.py` | Shamir Secret Sharing: `split_secret`, `reconstruct_secret` over the integers |
| `vote_encryptor.py` | CLI: computes `voteBlock`, encodes candidate index as `voteBlock^i`, Paillier encrypts |
| `homomorphic_aggregator.py` | CLI: reads IPFS ballot list, multiplies ciphertexts homomorphically, outputs aggregate |
| `verification.py` | **Flask server** on `:5000`. OCR-extracts IC number from uploaded photos (EasyOCR), performs face matching against selfie (DeepFace/Facenet512). Returns `{ ic_number, ic_verified, face_matched }` |

**`verification.py` endpoints:**

| Route | Method | Description |
|---|---|---|
| `/verify` | POST | Accepts `multipart/form-data` with `front`, `back`, `selfie_image` files |

**IC OCR regex patterns:**
- Front: `\b(\d{6}-\d{2}-\d{4})\b`
- Back: `\b(\d{6}-\d{2}-\d{4})-\d{2}-\d{2}\b`

---

## 10. Role Assignment & User Onboarding

### New User Flow

1. User clicks "Connect Wallet" → MetaMask `eth_requestAccounts`
2. `checkRegistrationStatus(address)` is called:
   - `isAdmin` → redirect `/admin`
   - `isOrganizer` (approved) → redirect `/organizer-dashboard`
   - `isCandidate` (verified) → redirect `/candidate-dashboard`
   - `isVoter` (verified) → redirect `/voter-dashboard`
   - Unregistered → `RoleSelectionModal` with three choices
3. User selects Voter / Candidate / Organizer → navigate to registration page

### IC & Email Uniqueness
`registerVoter` and `registerCandidate` both check `usedICs[keccak256(ic)]` and `usedEmails[email]` globally across all roles. A single IC or email cannot appear twice in the system under any role.

### Admin Panel Approval Queue
Shows all `PENDING` organizers with organization name, email, description. "Approve" calls `verifyOrganizer(address)` → status becomes `APPROVED` → organizer can now create elections.

---

## 11. Election Creation & Management

### Creation (OrganizerDashboard)

The organizer fills a modal form with six `datetime-local` inputs converted to Unix timestamps (`Math.floor(date.getTime() / 1000)`). Local validation enforces:
- `nominationStart > now`
- `nominationEnd > nominationStart`
- `startTime > nominationEnd`
- `endTime > startTime`

Same four ordering rules are also enforced on-chain in `createElection()`.

### On-chain `createElection(title, desc, nomStart, nomEnd, start, end)`:
- Requires caller is an approved organizer
- Creates `Election` struct; increments `electionCounter`; pushes to `electionIds`
- Emits `ElectionCreated`

### Phase 3 Auto-Trigger
`OrganizerManageElection` has a `useEffect` that fires `handleAggregateVotes()` when `election.endTime < now && !tallyStatus.tallyStored`. This:
1. Fetches all nullifiers from `getZKPVoteNullifiers(electionId)`
2. Resolves each nullifier → CID → IPFS fetch → extracts `encrypted_vote`
3. Homomorphically multiplies all ciphertexts: $E(\text{msum}) = \prod c_k \bmod n^2$
4. Computes `tallyInputHash = keccak256(CID_0 ‖ CID_1 ‖ … ‖ CID_n)`
5. Calls `storeEncryptedTally(electionId, encryptedTallyJSON, tallyInputHash)`

---

## 12. Candidate Application & Approval

1. **Verified candidate** opens `CandidateElections` — all elections shown
2. During nomination window: "Apply" → `applyToElection(electionId)`
   - Contract checks: election exists, within nomination window, candidate `VERIFIED`, not already applied
   - Sets `candidateApplicationStatus[id][wallet] = 1` (PENDING)
3. **Organizer** sees applicant in `OrganizerManageElection` with status "Pending"
4. **Approve** → `approveCandidateForElection(id, wallet)` → status `2` (must be before `startTime`)
   **Reject** → `rejectCandidateForElection(id, wallet)` → status `3`
5. `getApprovedCandidates(id)` returns only `status=2` addresses; used in `vote()` to validate `numCandidates`

| Code | Meaning |
|---|---|
| `0` | Not applied |
| `1` | Pending organizer review |
| `2` | Approved — appears in ballot |
| `3` | Rejected |

---

## 13. End-to-End Voting Flow

Triggered by `handleVote(electionId, candidateAddress, ic)` in `VoterElections.js`.

### Step 0 — IC Prompt
The **IC Confirmation Modal** asks the voter for their Malaysian IC. Used only to generate the ZKP proof; **never sent to the blockchain or any server**.

### Step 1 — Ballot Encryption (client-side)
```
publicKeyN  ← contract.getPaillierPublicKey()
voteBlock   = computeVoteBlock(totalVoters)    // 10^k, k = ceil(log10(totalVoters+1))
candidateIndex = getCandidateIndex(candidates, candidateAddress)
encryptedVote = encryptVote(publicKeyN, candidateIndex, voteBlock)
              // plaintext = voteBlock^candidateIndex
              // c = (n+1)^plaintext · r^n mod n²
```
See [phe.md](phe.md) for full Paillier details.

### Step 2 — IPFS Upload
```
votePackage = { election_id, encrypted_vote, vote_block, encryption_method: "Paillier-RadixPack" }
ipfsCID = await ipfsClient.uploadJSON(votePackage)
await ipfsClient.pin(ipfsCID)
```

### Step 3 — ZKP Proof Generation (~10–30 s in browser)
```
voterSecret = getVoterSecret(walletAddress)   // from localStorage
{ pA, pB, pC, pubSignals } =
    await generateVoteProof(ic, walletAddress, voterSecret,
                            electionId, candidateIndex, numCandidates)
```
The Groth16 proof proves: voter is ≥ 18, knows the secret behind the registered `voterCommitment`, the nullifier is unspent, and the `choiceCommitment` corresponds to a valid in-range candidate. See [zkp.md](zkp.md) for full ZKP details.

### Step 4 — On-Chain Submission
```
contract.vote(electionId, ipfsCID, pA, pB, pC, pubSignals)
```

**11-step contract validation in `vote()`:**

| # | Check | Revert |
|---|---|---|
| 1 | Election exists | `ElectionNotFound` |
| 2 | `startTime ≤ now ≤ endTime` | `ElectionNotOpen` |
| 3 | `ipfsCID` non-empty | `EmptyInput` |
| 4 | Paillier key is set | `KeyNotSet` |
| 5 | Verifier contract is set | `NoVerifier` |
| 6 | `pubSignals[2] == electionId` | `InvalidElectionId` |
| 7 | `pubSignals[0] == 18` | `InvalidAge` |
| 8 | `pubSignals[4/5/6]` match `_timestampToDate(block.timestamp)` | `InvalidDate` |
| 9 | `pubSignals[7] == approvedCandidates.length` | `CandidateCountMismatch` |
| 10 | `nullifierUsed[electionId][nullifier] == false` | `AlreadyVoted` |
| 11 | `voterCommitments[commitment] == true` | `NotRegistered` |
| 12 | `voteVerifier.verifyProof(pA, pB, pC, pubSignals) == true` | `ProofFailed` |

**Anonymous storage on success:**
```solidity
nullifierUsed[electionId][nullifier] = true;
zkpVotes[electionId][nullifier] = ipfsCID;
voteChoiceCommitments[electionId][nullifier] = bytes32(pubSignals[8]);
zkpVoteNullifiers[electionId].push(nullifier);
election.totalVotes++;
emit ZKPVoteCast(electionId, nullifier, choiceCommitment, block.timestamp);
```
The voter's wallet address is **never associated with their ballot or nullifier** anywhere in the contract.

---

## 14. Results Computation & Publication

### Phase 3 Summary
The organizer's browser multiplies all Paillier ciphertexts homomorphically:
$$E(\text{msum}) = \prod_{k=1}^{V} c_k \bmod n^2 = E\!\left(\sum_{k=1}^{V} \text{voteBlock}^{i_k}\right)$$
This exploits the Paillier additive homomorphic property. See [phe.md](phe.md) for the full mathematical treatment.

### Phase 4 Summary
The organizer loads ≥ 2 trustee share JSON files, enters each passphrase to AES-decrypt the `y` values, reconstructs the Paillier private key using Lagrange interpolation, decrypts `E(msum)`, and extracts per-candidate counts via digit extraction:
$$\text{count}[i] = \left\lfloor \frac{m_{\text{sum}}}{\text{voteBlock}^i} \right\rfloor \bmod \text{voteBlock}$$
See [phe.md](phe.md) for full threshold decryption details.

### Results JSON (stored on-chain via `publishResults`)
```json
{
  "election_id": 1,
  "decrypted_total": "...",
  "total_votes": 123,
  "per_candidate_votes": { "0": 45, "1": 38, "2": 40 },
  "candidates": ["0x...", "0x...", "0x..."],
  "method": "Paillier Threshold Decryption",
  "shares_used": 2,
  "published_at": "2026-03-04T..."
}
```

### Results Display (`ElectionResults`)
- `getResults(electionId)` → parses `decryptedResult` JSON
- Maps `per_candidate_votes[String(index)]` onto candidate array
- Displays vote counts, percentage bars, and winner highlight

---

## 15. Cryptographic Subsystems (Summary)

BlockVote uses two major cryptographic subsystems. Full technical details are in separate documents.

### 15.1 Paillier Homomorphic Encryption → see [phe.md](phe.md)

| Aspect | Summary |
|---|---|
| Key size | 1024-bit modulus $n = p \cdot q$ (two 512-bit primes) |
| Encoding | Radix-slot packing: vote for candidate $i$ encodes as $B^i$ where $B = 10^k > \text{totalVoters}$ |
| Encryption | $c = (n+1)^m \cdot r^n \bmod n^2$, fresh random $r$ per vote |
| Aggregation | Homomorphic product $\prod c_k \bmod n^2 = E(\text{msum})$ — no decryption during tallying |
| Key distribution | Shamir 2-of-3 secret sharing of $\lambda = \text{lcm}(p-1, q-1)$; shares AES-256-GCM encrypted per trustee |
| Decryption | Lagrange interpolation (BigInt, integer field) reconstructs $\lambda$; Paillier decryption yields $m_{\text{sum}}$ |

### 15.2 Groth16 Zero-Knowledge Proofs → see [zkp.md](zkp.md)

| Aspect | Summary |
|---|---|
| Circuit | `regCheck.circom` (Circom 2.0, BN254); 4 private inputs, 9 public signals |
| What is proven | IC validity, age ≥ 18, voter commitment ownership, non-double-vote nullifier, in-range candidate choice |
| Proof generation | Browser-side via `snarkjs.groth16.fullProve` using `regCheck.wasm` + `regCheck_final.zkey` (~10–30 s) |
| On-chain verification | `Groth16Verifier.sol` — EVM precompiles 6, 7, 8 (BN128 add, scalar mul, pairing) |
| Replay protection | Same-day date binding, election ID binding, nullifier uniqueness, voter commitment check |

---

## 16. Contract: Custom Errors

| Error | Thrown When |
|---|---|
| `NotAdmin()` | `onlyAdmin` modifier: caller is not `admin` |
| `NotTrustee()` | `onlyTrustee` modifier: caller has no trustee record |
| `Unauthorized()` | Caller is neither admin nor the election's organizer |
| `ZeroAddress()` | `address(0)` passed where a non-zero address is required |
| `AlreadyRegistered()` | Voter/Candidate/Organizer already registered; or candidate already applied to election |
| `ICAlreadyUsed()` | IC hash already exists in `usedICs` |
| `EmailAlreadyUsed()` | Email already in `usedEmails` |
| `NotRegistered()` | Address has no registration record; or `voterCommitments[commitment] == false` in `vote()` |
| `NotPending()` | Voter/Candidate not in `status=0`; or candidate application not pending |
| `NotVerified()` | Candidate `status != 1` when trying to apply to election |
| `NoVerifier()` | `voteVerifier` contract address is not set |
| `InvalidAge()` | `pubSignals[0] != 18` |
| `InvalidElectionId()` | `pubSignals[2]` does not match expected `electionId` |
| `InvalidCommitment()` | `pubSignals[3] == 0` (zero commitment) |
| `InvalidDate()` | ZKP date signals do not match `_timestampToDate(block.timestamp)` |
| `ProofFailed()` | `voteVerifier.verifyProof()` returned `false` |
| `AlreadyVoted()` | Nullifier already used in this election |
| `NotInNominationWindow()` | `applyToElection` called outside `[nominationStart, nominationEnd]` |
| `ElectionNotFound()` | ID is 0 or greater than `electionCounter` |
| `ElectionNotOpen()` | `vote()` called outside `[startTime, endTime]` |
| `EmptyInput()` | Empty string or zero bytes passed |
| `KeyNotSet()` | `getPaillierPublicKey()` called before key was set |
| `AlreadyKeySet()` | `setPaillierPublicKey` called a second time |
| `AlreadyCommitted()` | Trustee calls `submitShareCommitment` twice |
| `CandidateCountMismatch()` | `pubSignals[7] != getApprovedCandidates(electionId).length` |
| `TallyHashMismatch()` | `keccak256` of packed CIDs does not match supplied `tallyInputHash` |
| `TallyNotStored()` | Phase 4 operations called before Phase 3 is complete |
| `AlreadyPublished()` | `storeEncryptedTally` or `publishResults` called a second time; or trustee re-submits decryption share |
| `ElectionNotEnded()` | `storeEncryptedTally` called while `now <= endTime` |
| `NoVotesCast()` | `storeEncryptedTally` called when `zkpVoteNullifiers[id].length == 0` |
| `AlreadyProcessed()` | `verifyOrganizer` called on organizer whose status is already non-zero |
| `ElectionAlreadyStarted()` | Candidate approval/rejection attempted when `now >= startTime` |
| `InvalidThreshold()` | Constructor: `threshold < 2` |
| `InsufficientTrustees()` | Constructor: fewer than 2 trustee addresses supplied |
| `ThresholdTooLarge()` | Constructor: `threshold > trusteeAddresses.length` |
| `TimingError()` | `createElection` timing constraints violated |

---

## 17. Contract: Events

| Event | Emitted By | Key Parameters |
|---|---|---|
| `PaillierPublicKeySet` | `setPaillierPublicKey` | `string publicKeyN`, `uint256 timestamp` |
| `TrusteeRegistered` | Constructor | `address indexed trusteeAddress`, `uint256 timestamp` |
| `ShareCommitmentSubmitted` | `submitShareCommitment` | `address indexed trusteeAddress`, `bytes32 commitment`, `uint256 timestamp` |
| `VoterRegistered` | `registerVoter` | `address indexed wallet`, `string name`, `string email`, `uint256 timestamp` |
| `CandidateRegistered` | `registerCandidate` | `address indexed wallet`, `string name`, `string email`, `uint256 timestamp` |
| `OrganizerRegistered` | `registerOrganizer` | `address indexed applicant`, `string organizationName`, `uint256 timestamp` |
| `VoterVerified` | `verifyVoterWithZKP` | `address indexed wallet`, `uint256 timestamp` |
| `CandidateVerified` | `verifyCandidateWithZKP` | `address indexed wallet`, `uint256 timestamp` |
| `OrganizerVerified` | `verifyOrganizer` | `address indexed applicant`, `uint256 timestamp` |
| `VoterCommitmentStored` | `verifyVoterWithZKP` | `bytes32 indexed commitment`, `uint256 timestamp` |
| `ElectionCreated` | `createElection` | `uint256 indexed electionId`, `string title`, `address indexed organizer`, four timestamps, `uint256 timestamp` |
| `CandidateApplied` | `applyToElection` | `uint256 indexed electionId`, `address indexed candidateWallet`, `uint256 timestamp` |
| `CandidateApproved` | `approveCandidateForElection` | `uint256 indexed electionId`, `address indexed candidateWallet`, `address indexed approver`, `uint256 timestamp` |
| `CandidateRejected` | `rejectCandidateForElection` | `uint256 indexed electionId`, `address indexed candidateWallet`, `address indexed rejector`, `uint256 timestamp` |
| `ZKPVoteCast` | `vote` | `uint256 indexed electionId`, `bytes32 indexed nullifierHash`, `bytes32 indexed choiceCommitment`, `uint256 timestamp` |
| `EncryptedTallyStored` | `storeEncryptedTally` | `uint256 indexed electionId`, `string encryptedTally`, `uint256 totalVotesCounted`, `uint256 timestamp` |
| `DecryptionShareSubmitted` | `submitDecryptionShare` | `uint256 indexed electionId`, `address indexed trustee`, `bytes32 shareHash`, `uint256 timestamp` |
| `ResultsPublished` | `publishResults` | `uint256 indexed electionId`, `string decryptedResult`, `uint256 timestamp` |
