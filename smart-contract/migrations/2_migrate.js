const Contract = artifacts.require("Contract");

module.exports = function (deployer, network, accounts) {
  const trusteeAddresses = [
    accounts[1],  // Trustee 1
    accounts[2],  // Trustee 2
    accounts[3]   // Trustee 3
  ];

  const threshold = 2;  // Minimum 2 trustees needed for decryption

  console.log("\n=== Deploying Contract with Trustees ===");
  console.log("Admin:", accounts[0]);
  console.log("Trustees:", trusteeAddresses);
  console.log("Threshold:", threshold);
  console.log("=====================================\n");

  deployer.deploy(Contract, trusteeAddresses, threshold).then(async () => {
    console.log("✅ Contract deployed successfully.");
  });
};
