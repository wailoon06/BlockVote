import * as dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

async function main() {
  const RPC_URL =
    "https://polygon-amoy.infura.io/v3/ae885df7ad224699ae0c853b54d5d916";
  const PRIVATE_KEY = process.env.PRIVATE_KEY;
  const ADDRESSES_STRING = process.env.RECEIVER_ADDRESSES;
  const AMOUNT = "0.5"; // Update amount to 2 POL

  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY in .env");
  if (!ADDRESSES_STRING) throw new Error("Missing RECEIVER_ADDRESSES in .env. Format: 0x123...,0x456...");

  // Split the string into an array and clean up any extra whitespace
  const toAddresses = ADDRESSES_STRING.split(",").map(addr => addr.trim());

  const provider = new ethers.JsonRpcProvider(RPC_URL, {
    name: "polygon-amoy",
    chainId: 80002,
  });

  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("From:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Current balance:", ethers.formatEther(balance), "POL");

  // Loop through each address and send the transaction
  for (const address of toAddresses) {
    if (!ethers.isAddress(address)) {
      console.error(`\nSkipping invalid address: ${address}`);
      continue;
    }

    console.log(`\nSending ${AMOUNT} POL to ${address}...`);
    
    try {
      const tx = await wallet.sendTransaction({
        to: address,
        value: ethers.parseEther(AMOUNT),
      });

      console.log("Transaction sent! Hash:", tx.hash);

      const receipt = await tx.wait();
      console.log("Confirmed in block:", receipt.blockNumber);
      console.log(`Explorer: https://amoy.polygonscan.com/tx/${tx.hash}`);
    } catch (error) {
       console.error(`Transfer to ${address} failed:`, error.message || error);
    }
  }
  
  console.log("\nAll transfers complete.");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});