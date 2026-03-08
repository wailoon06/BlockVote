const Contract = artifacts.require("Contract");

module.exports = function (deployer, network, accounts) {
  // Real trustee wallet addresses (from BlockVote deployment plan)
  const trusteeAddresses = [
    '0xad9b4F51227E4Cb19e6741dDea6cCB870cf6F9c8',  // Trustee 1
    '0xDC432a83f908491a0bF7145D00e14cd21e27a6B1',  // Trustee 2
    '0x5534F12Db5df11dDC785aa3aAa0a1F61E3E0aD83'   // Trustee 3
  ];
  
  const threshold = 2;  // Minimum 2 trustees needed for decryption
  
  console.log("\n=== Deploying Contract with Trustees ===");
  console.log("Admin:", accounts[0]);
  console.log("Trustees:", trusteeAddresses);
  console.log("Threshold:", threshold);
  console.log("=====================================\n");
  
  deployer.deploy(Contract, trusteeAddresses, threshold);
};
