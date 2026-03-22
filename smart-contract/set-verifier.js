import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import web3Pkg from "web3";
import dotenv from "dotenv";

dotenv.config();

const { Web3 } = web3Pkg;
const Web3Ctor =
  typeof web3Pkg === "function"
    ? web3Pkg
    : Web3 ?? web3Pkg.default?.Web3 ?? web3Pkg.default;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getRpcUrl(networkName) {
  if (networkName === "amoy") {
    if (!process.env.AMOY_RPC_URL) {
      throw new Error("Missing AMOY_RPC_URL for amoy");
    }
    return process.env.AMOY_RPC_URL;
  }
  return process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545";
}

function loadDeployment(networkName) {
  const deploymentPath = path.join(__dirname, "deployments", `${networkName}.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}`);
  }
  return JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
}

async function main() {
  const networkName = process.env.DEPLOY_NETWORK || process.env.HARDHAT_NETWORK || "amoy";
  const rpcUrl = getRpcUrl(networkName);
  const deployment = loadDeployment(networkName);

  const artifactPath = path.join(
    __dirname,
    "artifacts",
    "contracts",
    "contract.sol",
    "Contract.json",
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));

  if (!Web3Ctor) {
    throw new Error("Unable to resolve Web3 constructor from web3 package");
  }

  const web3 = new Web3Ctor(rpcUrl);

  let adminAddress;
  if (process.env.PRIVATE_KEY) {
    const normalized = process.env.PRIVATE_KEY.startsWith("0x")
      ? process.env.PRIVATE_KEY
      : `0x${process.env.PRIVATE_KEY}`;
    adminAddress = web3.eth.accounts.wallet.add(normalized).address;
  } else {
    const accounts = await web3.eth.getAccounts();
    if (!accounts.length) {
      throw new Error("No admin account available. Set PRIVATE_KEY.");
    }
    adminAddress = accounts[0];
  }

  const contract = new web3.eth.Contract(artifact.abi, deployment.mainContract.address);

  await contract.methods.setVoteVerifier(deployment.verifier.address).send({
    from: adminAddress,
    gas: 500000,
  });

  const current = await contract.methods.voteVerifier().call();
  console.log("Vote verifier linked:", current);
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export default main;
