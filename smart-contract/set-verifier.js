// Set verifier address in main contract
const Contract = artifacts.require("Contract");
const Groth16Verifier = artifacts.require("Groth16Verifier");

module.exports = async function(callback) {
  try {
    console.log("Setting verifier address in main contract...");
    
    const contract = await Contract.deployed();
    const verifier = await Groth16Verifier.deployed();
    
    console.log("Main Contract:", contract.address);
    console.log("Groth16Verifier:", verifier.address);
    
    const accounts = await web3.eth.getAccounts();
    const admin = accounts[0];
    
    console.log("Admin account:", admin);
    
    await contract.setVoteVerifier(verifier.address, { from: admin });
    
    console.log("\u2713 VoteVerifier set successfully!");
    
    // Verify it was set
    const verifierAddress = await contract.voteVerifier();
    console.log("Confirmed voteVerifier address:", verifierAddress);
    
    callback();
  } catch (error) {
    console.error("Error:", error);
    callback(error);
  }
};
