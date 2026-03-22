import { network } from "hardhat";
import * as dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type DeploymentRecord = {
  network: string;
  chainId: number;
  deployer: `0x${string}`;
  mainContract: {
    address: `0x${string}`;
  };
  verifier: {
    address: `0x${string}`;
  };
  deployedAt: string;
};

async function main() {
  const networkConnection = await network.connect();
  const { viem } = networkConnection;
  const [deployer] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  const chainId = Number(await publicClient.getChainId());
  const networkName = process.env.DEPLOY_NETWORK ?? process.env.HARDHAT_NETWORK ?? "localhost";
  
  console.log("Deploying with:", deployer.account.address);
  console.log("Network:", networkName, "| Chain ID:", chainId);

  const trustee1 = process.env.TRUSTEE_1;
  const trustee2 = process.env.TRUSTEE_2;
  const trustee3 = process.env.TRUSTEE_3;

  if (!trustee1 || !trustee2 || !trustee3) {
    throw new Error("Missing trustee address env vars: TRUSTEE_1, TRUSTEE_2, TRUSTEE_3");
  }

  const trusteeAddresses = [trustee1, trustee2, trustee3] as `0x${string}`[];

  const threshold = BigInt(process.env.TRUSTEE_THRESHOLD ?? "2");

  const verifier = await viem.deployContract("Groth16Verifier");
  console.log("Verifier deployed to:", verifier.address);

  const contract = await viem.deployContract("Contract", [
    trusteeAddresses,
    threshold,
  ]);

  await contract.write.setVoteVerifier([verifier.address], {
    account: deployer.account,
  });

  console.log("Vote verifier linked on main contract");

  console.log("Contract deployed to:", contract.address);

  const deploymentsDir = path.resolve(__dirname, "..", "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });

  const deployment: DeploymentRecord = {
    network: networkName,
    chainId,
    deployer: deployer.account.address,
    mainContract: {
      address: contract.address,
    },
    verifier: {
      address: verifier.address,
    },
    deployedAt: new Date().toISOString(),
  };

  const outputPath = path.join(deploymentsDir, `${networkName}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(deployment, null, 2));
  console.log("Deployment metadata saved to:", outputPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});