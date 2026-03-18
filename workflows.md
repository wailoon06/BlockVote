# BlockVote System Workflows

This document outlines the core execution workflows for the BlockVote system based on its cryptographic and architectural implementation.

### 1. Voter Registration and Eligibility Setup (Actor(s): Voter, Admin/Organizer)
The following steps are the execution of registering a voter and setting up their Zero-Knowledge identity.
(1) Voter connects their wallet and navigates to the Voter Registration portal.
(2) Voter's client (DApp) generates a secret key locally and computes a public identity commitment (e.g., using a Poseidon hash in `poseidonUtils.js`).
(3) Voter submits their public identity commitment alongside any required real-world registration details to the system.
(4) Admin or Organizer reviews the Voter's submitted information via the external/manual verification interface.
(5) Upon successful verification, the Admin/Organizer approves the registration, which whitelists the Voter's public identity commitment in the smart contract (adding it to the eligible voters list/Merkle tree).
(6) The Voter is now successfully registered and authorized to generate ZKPs for future elections.

### 2. Casting an Encrypted and Anonymous Vote (Actor(s): Voter, Smart Contract)
The following steps outline how a voter casts a vote without revealing their identity or choice.
(1) Voter logs into the DApp, navigates to `VoterElections.js`, and selects an active election.
(2) Voter selects their preferred candidate from the UI.
(3) The client extracts the election's public key and locally encrypts the Voter's choice using Paillier Homomorphic Encryption (`voteEncryption.js`).
(4) The client utilizes the Voter's locally stored secret key to generate a Zero-Knowledge Proof (`zkpProofGenerator.js` via `regCheck.circom` circuits) confirming they are part of the whitelisted group without revealing which specific member they are.
(5) The client computes a unique "nullifier" to prevent double-voting.
(6) Voter submits the encrypted vote, the ZKP, and the nullifier to the smart contract.
(7) The smart contract (`Verifier.sol`) mathematically verifies the ZKP. If valid and the nullifier is unused, the contract accepts and stores the encrypted vote on the blockchain.

### 3. Election Tallying and Threshold Decryption (Actor(s): Organizer, Trustees, System)
The following steps happen when an election concludes and results need to be tallied securely.
(1) Organizer closes the election voting phase via the Organizer Dashboard.
(2) The system homomorphically aggregates all submitted encrypted votes directly into a single encrypted totals tally (`homomorphicAggregator.js`), keeping the sum entirely encrypted.
(3) The encrypted tally is finalized and broadcasted to the designated election Trustees.
(4) Each Trustee logs into the `TrusteeDashboard.js` and retrieves their respective Shamir's Secret Share (e.g., from `trustee_shares/trustee_1.json`).
(5) Each Trustee locally computes a partial decryption of the encrypted tally using their secret share. This heavy computation is offloaded to a background thread (`computePartialU.worker.js`).
(6) Each Trustee submits their partial decryption proof back to the system.
(7) Once the system collects the minimum required threshold of partial decryptions, it mathematically combines them (`thresholdDecryption.js`) to reveal the final plaintext election results.
(8) The final decrypted vote counts are permanently pushed to the UI for all users to view on `ElectionResults.js`.

### 4. Election Initialization (Actor(s): Organizer, System)
The following steps outline the creation of a new election instance.
(1) Organizer navigates to `OrganizerManageElection.js`.
(2) Organizer inputs the overarching election configuration, including title, duration, and authorized candidates.
(3) Organizer initiates the generation of the Paillier cryptographic key pair for the election.
(4) The system splits the Paillier private key into individual shares using Shamir's Secret Sharing (`shamir_sharing.py` / `shareEncryption.js`) and distributes them among the authorized Trustees.
(5) Organizer deploys the election configuration, including the Paillier public key and candidate lists, to the smart contract.
(6) The election is officially opened for registration and voting.

### 5. Candidate Registration and Approval (Actor(s): Candidate, Organizer/Admin)
The following steps outline how a candidate applies to run in an election and gets approved.
(1) Candidate connects their wallet and navigates to `CandidateRegister.js` or their dashboard.
(2) Candidate selects an upcoming election they wish to participate in from the list of available elections.
(3) Candidate fills out their profile details (e.g., name, platform/manifesto) and submits the transaction to the smart contract.
(4) The system records the Candidate's application with a "pending" status.
(5) Organizer navigates to `OrganizerManageElection.js` to review the list of pending candidates for their election.
(6) Organizer manually verifies the candidate's real-world credentials off-chain.
(7) Organizer submits a transaction to explicitly approve or reject the candidate.
(8) Once approved, the Candidate is officially added to the smart contract's election roster, making them available for voters to select on the ballot.

### 6. System Initialization and ZKP Setup (Actor(s): Admin/System Deployer)
The following steps outline the initial deployment of the platform's cryptographic and smart contract infrastructure.
(1) Admin initiates the blockchain deployment process via Truffle (`2_migrate.js`, `3_deploy_verifier.js`).
(2) The core `contract.sol` and the ZKP `Verifier.sol` (generated from the `regCheck.circom` circuit) are deployed to the blockchain network.
(3) Admin runs configuration scripts (`phase1-setup.js`, `set-verifier.js`) to permanently link the ZKP verifier address to the main election smart contract.
(4) The final Zero-Knowledge proving keys (`regCheck_final.zkey`) and verified contract ABIs are published to the public directories or decentralized storage (`ipfs-manager.js`, `ipfsClient.js`).
(5) The application configurations (`contract.json`, `zkpConfig.js`) are updated with the corresponding network addresses.
(6) The DApp is now fully initialized and ready for Organizers and Users to interact with.

### 7. User Authentication and Role Resolution (Actor(s): User, System)
The following steps cover how a user enters the DApp and is routed to the correct interface securely.
(1) User navigates to the DApp's main URL (`index.html`).
(2) The system prompts the user to connect their Web3 Wallet (e.g., MetaMask) via the UI (`RoleSelectionModal.js` or `Navbar.js`).
(3) User approves the connection, exposing their public wallet address to the application.
(4) The client securely queries the main smart contract (`contractUtils.js`) to check the permissions and assigned roles bonded to that wallet address.
(5) Based on the smart contract's response, the system dynamically renders the appropriate Dashboard Layout (`AdminPanel.js`, `VoterDashboard.js`, `TrusteeDashboard.js`, etc.).
(6) The `Sidebar.js` and `Navbar.js` update to display only the actions authorized for the user's specific role.