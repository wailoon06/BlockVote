// ZKP Configuration
// Update these values after deploying and pinning artifacts
import * as dotenv from "dotenv";
dotenv.config();
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
      cid: bafybeidan73dkser2wvks2lhdr5brrzkfa64k7tvskj46opmyaw7qgnuae,
      gateway: 'https://gateway.pinata.cloud/ipfs/teal-official-eel-228.mypinata.cloud',
      sha256: "de35bfb7adcbe3cdbe90e0e72aaef8995afdc874f61db4c5b57a874e2e8fc26b"  // paste SHA-256 from Ubuntu after copying
    },
    zkey: {
      localPath: '/zkp/regCheck_final.zkey',
      cid: bafybeicla7cu2365pvzbe57yudihavwuks26q23idtch6ytgfjrwnxgtjy,
      gateway: 'https://gateway.pinata.cloud/ipfs/teal-official-eel-228.mypinata.cloud',
      sha256: "48910ffa5591a6921e5152daa8dfd20cfa2caa9d9d39f5f572c3eb7afb102e00"  // paste SHA-256 from Ubuntu after copying
    }
  },

  // ── Verifier contract (Groth16Verifier from Verifier.sol) ─────────────────
  verifier: {
    address: '0x0e0153675074ca9e94a41f6d9eb48c23e5d6e0f5',
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


























































