// Groth16Verifier is compiled from Verifier.sol — the snarkjs output of VoteWithICAgeCheck circuit
const Groth16Verifier = artifacts.require("Groth16Verifier");
const Contract = artifacts.require("Contract");

module.exports = async function (deployer) {
  // Deploy Groth16Verifier — handles 7-input ZKP proofs for anonymous voting
  await deployer.deploy(Groth16Verifier);
  const groth16Verifier = await Groth16Verifier.deployed();

  console.log("\n=== Deploying Groth16Verifier (VoteWithICAgeCheck) ===");
  console.log("Groth16Verifier address:", groth16Verifier.address);

  // Wire it into the main Contract as the vote verifier
  const contract = await Contract.deployed();
  await contract.setVoteVerifier(groth16Verifier.address);

  console.log("setVoteVerifier done:", groth16Verifier.address);
  console.log("=====================================\n");
};
