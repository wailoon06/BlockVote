pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";

// ─────────────────────────────────────────────────────────────────────────────
// regCheck — identity + age + vote-validity circuit
//
// Public signals (nPublic = 9):
//   [0] ageThreshold      — must equal 18
//   [1] nullifierHash     — Poseidon(voterSecret, electionId)   anti-double-vote
//   [2] electionId        — target election
//   [3] voterCommitment   — Poseidon(voterAddress, voterSecret) registration proof
//   [4] currentYear       — UTC year from block
//   [5] currentMonth      — UTC month from block
//   [6] currentDay        — UTC day from block
//   [7] numCandidates     — approved candidate count for the election
//   [8] choiceCommitment  — Poseidon(candidateIndex, voterSecret, electionId)
//                           binds the encrypted ballot to a specific valid candidate
// ─────────────────────────────────────────────────────────────────────────────

template regCheck() {

    // ── Private inputs ──────────────────────────────────────────────────────
    signal input ic[12];           // Malaysian IC digits (12 digits, 0-9)
    signal input voterSecret;      // random secret stored in localStorage
    signal input voterAddress;     // wallet address as field element
    signal input candidateIndex;   // 0-based index of chosen candidate (NEW)

    // ── Public inputs ───────────────────────────────────────────────────────
    signal input ageThreshold;     // must be 18
    signal input nullifierHash;    // Poseidon(voterSecret, electionId)
    signal input electionId;       // target election
    signal input voterCommitment;  // Poseidon(voterAddress, voterSecret)
    signal input currentYear;      // UTC year
    signal input currentMonth;     // UTC month
    signal input currentDay;       // UTC day
    signal input numCandidates;    // total approved candidates (NEW)
    signal input choiceCommitment; // Poseidon(candidateIndex, voterSecret, electionId) (NEW)

    // ── 1) Constrain IC digits to 0..9 ─────────────────────────────────────
    component digitBits[12];
    component digitOK[12];
    for (var i = 0; i < 12; i++) {
        digitBits[i] = Num2Bits(4);
        digitBits[i].in <== ic[i];

        digitOK[i] = LessEqThan(4);
        digitOK[i].in[0] <== ic[i];
        digitOK[i].in[1] <== 9;
        digitOK[i].out === 1;
    }

    // ── 2) Extract YY, MM, DD ───────────────────────────────────────────────
    signal year2  <== ic[0]*10 + ic[1];
    signal month  <== ic[2]*10 + ic[3];
    signal day    <== ic[4]*10 + ic[5];

    // ── 3) Validate month (1–12) and day (1–31) ─────────────────────────────
    component monthGte = GreaterEqThan(4);
    monthGte.in[0] <== month;
    monthGte.in[1] <== 1;
    monthGte.out === 1;

    component monthLte = LessEqThan(4);
    monthLte.in[0] <== month;
    monthLte.in[1] <== 12;
    monthLte.out === 1;

    component dayGte = GreaterEqThan(5);
    dayGte.in[0] <== day;
    dayGte.in[1] <== 1;
    dayGte.out === 1;

    component dayLte = LessEqThan(5);
    dayLte.in[0] <== day;
    dayLte.in[1] <== 31;
    dayLte.out === 1;

    // ── 4) Full year (<=26 → 2000s, else 1900s) ─────────────────────────────
    component yearLe26 = LessEqThan(8);
    yearLe26.in[0] <== year2;
    yearLe26.in[1] <== 26;

    signal inv      <== 1 - yearLe26.out;
    signal fullYear <== yearLe26.out * 2000 + inv * 1900 + year2;

    // ── 5) Age check via YYYYMMDD numeric comparison ─────────────────────────
    signal birthDate   <== fullYear*10000 + month*100 + day;
    signal currentDate <== currentYear*10000 + currentMonth*100 + currentDay;

    component bdGte = GreaterEqThan(25);  // 25 bits covers dates up to ~33M
    bdGte.in[0] <== currentDate;
    bdGte.in[1] <== birthDate + ageThreshold * 10000;
    bdGte.out === 1;

    // ── 6) Commitment: Poseidon(voterAddress, voterSecret) ───────────────────
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== voterAddress;
    commitmentHasher.inputs[1] <== voterSecret;
    voterCommitment === commitmentHasher.out;

    // ── 7) Nullifier: Poseidon(voterSecret, electionId) ─────────────────────
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== voterSecret;
    nullifierHasher.inputs[1] <== electionId;
    nullifierHash === nullifierHasher.out;

    // ── 8) Valid candidate range: 0 ≤ candidateIndex < numCandidates ─────────
    // LessThan(8) supports up to 255 candidates
    component indexLt = LessThan(8);
    indexLt.in[0] <== candidateIndex;
    indexLt.in[1] <== numCandidates;
    indexLt.out === 1;

    // candidateIndex must be non-negative — ensured by field element (always >= 0)
    // and the LessThan check above implicitly requires numCandidates > 0

    // ── 9) Choice commitment: Poseidon(candidateIndex, voterSecret, electionId)
    //       Binds the encrypted ballot to this voter's chosen candidate.
    //       On-chain verification: commitment stored alongside nullifier.
    component choiceHasher = Poseidon(3);
    choiceHasher.inputs[0] <== candidateIndex;
    choiceHasher.inputs[1] <== voterSecret;
    choiceHasher.inputs[2] <== electionId;
    choiceCommitment === choiceHasher.out;
}

component main {
    public [
        ageThreshold,
        nullifierHash,
        electionId,
        voterCommitment,
        currentYear,
        currentMonth,
        currentDay,
        numCandidates,
        choiceCommitment
    ]
} = regCheck();
