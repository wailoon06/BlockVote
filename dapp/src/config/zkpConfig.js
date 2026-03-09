// ZKP Configuration
// Update these values after deploying and pinning artifacts

export const ZKP_CONFIG = {
  // ── Legacy AgeCheck circuit (kept for reference) ─────────────────────────
  artifacts: {
    wasm: {
      localPath: '/zkp/agecheck.wasm',
      cid: null,
      gateway: 'https://ipfs.io/ipfs/',
      sha256: '697d7ab19391db1a65eb71b4daaaaac8be98760ae4db173142ada92ec85d52a5'
    },
    zkey: {
      localPath: '/zkp/agecheck_final.zkey',
      cid: null,
      gateway: 'https://ipfs.io/ipfs/',
      sha256: '3f490310b661c615ecf2cbad0c97421054885c03865eb0e72b3ed4f390b7dac4'
    }
  },

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
      sha256: "58cff773023fc837a6839a5e4097539851636e15fcd0f2e3b435420bec05d890"  // paste SHA-256 from Ubuntu after copying
    },
    zkey: {
      // File copied from Ubuntu: circuit_final.zkey
      localPath: '/zkp/regCheck_final.zkey',
      cid: null,
      gateway: 'https://ipfs.io/ipfs/',
      sha256: "a22453b5bbd88490d2adab18c9bc877399eef9fa2a929c42e2614fadf23e16ad"  // paste SHA-256 from Ubuntu after copying
    }
  },

  // ── Verifier contract (Groth16Verifier from Verifier.sol) ─────────────────
  verifier: {
    address: '0x83101c030e2A375093C720b6B81e5B46FefA60Ca',
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








































