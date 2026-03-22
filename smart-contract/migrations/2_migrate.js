const Contract = artifacts.require("Contract");

module.exports = function (deployer, network, accounts) {
  let trusteeAddresses;

  // Use testnet/mainnet addresses if deploying to amoy/polygon
  if (network === 'amoy' || network === 'polygon' || network === 'goerli') {
    // Replace these with your actual testnet wallet addresses!
    trusteeAddresses = [
      process.env.TRUSTEE_1 || "0x1111111111111111111111111111111111111111",
      process.env.TRUSTEE_2 || "0x2222222222222222222222222222222222222222",
      process.env.TRUSTEE_3 || "0x3333333333333333333333333333333333333333"
    ];
  } else {
    // Local development network (ganache)
    trusteeAddresses = [
      accounts[1],  // Trustee 1
      accounts[2],  // Trustee 2
      accounts[3]   // Trustee 3
    ];
  }

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
