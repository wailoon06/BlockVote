// ZKP Configuration
// Update these values after deploying and pinning artifacts

export const ZKP_CONFIG = {
  // ── regCheck circuit (used for both registration & voting) ──────────────
  // Circuit public signals (nPublic = 9):
  //   [0] ageThreshold      must equal 18
  //   [1] nullifierHash     Poseidon(voterSecret, electionId)  — anti-double-vote
  //   [2] electionId        target election (0 = registration)
  //   [3] voterCommitment   Poseidon(voterAddress, voterSecret) — registration proof
  //   [4] currentYear       UTC year from block
  //   [5] currentMonth      UTC month from block
  //   [6] currentDay        UTC day from block
  //   [7] numCandidates     approved candidate count for the election
  //   [8] choiceCommitment  Poseidon(candidateIndex, voterSecret, electionId)
  //                         — binds encrypted ballot to a proven valid candidate
  voteArtifacts: {
    wasm: {
      localPath: '/zkp/regCheck.wasm',
      cid: null,
      gateway: 'https://ipfs.io/ipfs/',
      sha256: "de35bfb7adcbe3cdbe90e0e72aaef8995afdc874f61db4c5b57a874e2e8fc26b"  // paste SHA-256 from Ubuntu after copying
    },
    zkey: {
      // File copied from Ubuntu: circuit_final.zkey
      localPath: '/zkp/regCheck_final.zkey',
      cid: null,
      gateway: 'https://ipfs.io/ipfs/',
      sha256: "48910ffa5591a6921e5152daa8dfd20cfa2caa9d9d39f5f572c3eb7afb102e00"  // paste SHA-256 from Ubuntu after copying
    }
  },

  // ── Verifier contract (Groth16Verifier from Verifier.sol) ─────────────────
  verifier: {
    address: '0xe5C327cd98153F8fE7C1AEadbDB7699dF049c9d5',
    network: 'development',
    bytecodeHash: null
  },

  // ── Feature flags ──────────────────────────────────────────────────────────
  features: {
    useIPFS: false,
    verifyArtifactHashes: false, // set true once sha256 values are filled in
    verifyContractBytecode: false
  }
};





















































