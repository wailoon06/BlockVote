/**
 * Phase 1: Key setup after contract deployment.
 *
 * This script automates:
 * 1. Paillier keypair generation
 * 2. Public key upload to blockchain
 * 3. Secret splitting via Shamir
 * 4. Share encryption and distribution files
 * 5. Share commitment submission
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import web3Pkg from "web3";
import * as readline from "node:readline/promises";
import dotenv from "dotenv";
import { encryptShareY } from "./shareEncryption.js";

const { Web3 } = web3Pkg;
const Web3Ctor =
  typeof web3Pkg === "function"
    ? web3Pkg
    : Web3 ?? web3Pkg.default?.Web3 ?? web3Pkg.default;

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getRpcUrl(networkName) {
  if (networkName === "amoy") {
    if (!process.env.AMOY_RPC_URL) {
      throw new Error("Missing AMOY_RPC_URL for amoy phase1 setup");
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

function loadContractArtifact() {
  const artifactPath = path.join(
    __dirname,
    "artifacts",
    "contracts",
    "contract.sol",
    "Contract.json",
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Contract artifact not found: ${artifactPath}`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
}

function getAdminAccount(web3) {
  const privateKey = process.env.PRIVATE_KEY;
  if (privateKey) {
    const normalized = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    const account = web3.eth.accounts.wallet.add(normalized);
    return account.address;
  }
  return null;
}

async function generatePaillierKeypair() {
  console.log("\n[Phase1] Generating Paillier keypair...");

  const backendDir = path.join(__dirname, "..", "backend");
  const escapedBackendPath = backendDir.replace(/\\/g, "\\\\");
  const tempScriptPath = path.join(backendDir, "temp_keygen.py");

  const script = `
import sys
import json
sys.path.append('${escapedBackendPath}')
from paillier_crypto import PaillierCrypto

crypto = PaillierCrypto(key_length=2048)
public_key, private_key = crypto.generate_keypair()

result = {
    'public_key_n': str(public_key.n),
    'private_key_lambda': str(private_key.get_lambda()),
    'private_key_mu': str(private_key.mu),
    'p': str(private_key.p),
    'q': str(private_key.q)
}
print(json.dumps(result))
`;

  fs.writeFileSync(tempScriptPath, script);
  try {
    const output = execSync(`python "${tempScriptPath}"`, { encoding: "utf-8" });
    return JSON.parse(output.trim());
  } finally {
    if (fs.existsSync(tempScriptPath)) {
      fs.unlinkSync(tempScriptPath);
    }
  }
}

async function splitPrivateKey(lambdaValue, muValue, n, threshold, numShares) {
  console.log("\n[Phase1] Splitting secret into trustee shares...");

  const backendDir = path.join(__dirname, "..", "backend");
  const escapedBackendPath = backendDir.replace(/\\/g, "\\\\");
  const tempScriptPath = path.join(backendDir, "temp_split.py");

  const script = `
import sys
import json
import hashlib
sys.path.append('${escapedBackendPath}')
from shamir_sharing import ShamirSecretSharing

n_val = int(${n})
modulus = n_val * int(${lambdaValue})
n_sq = n_val * n_val

h = hashlib.sha256(str(n_val).encode()).hexdigest()
v_base = int(h, 16)
v = pow(v_base, 2 * n_val, n_sq)

shamir = ShamirSecretSharing(prime=modulus)
S = (int(${lambdaValue}) * int(${muValue})) % modulus
shares = shamir.split_secret(S, ${threshold}, ${numShares})

result = {
  'shares': [{'x': x, 'y': str(y), 'v_i': str(pow(v, y, n_sq))} for x, y in shares],
  'v': str(v)
}
print(json.dumps(result))
`;

  fs.writeFileSync(tempScriptPath, script);
  try {
    const output = execSync(`python "${tempScriptPath}"`, { encoding: "utf-8" });
    return JSON.parse(output.trim());
  } finally {
    if (fs.existsSync(tempScriptPath)) {
      fs.unlinkSync(tempScriptPath);
    }
  }
}

async function distributeShares(web3, shares, vGenerator, trusteeAddresses) {
  const sharesDir = path.join(__dirname, "..", "trustee_shares");
  fs.mkdirSync(sharesDir, { recursive: true });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const commitments = [];

  try {
    for (let i = 0; i < shares.length; i++) {
      const share = shares[i];
      const passphrase = await rl.question(`Enter passphrase for Trustee ${i + 1}: `);
      if (!passphrase || passphrase.trim().length === 0) {
        throw new Error(`Passphrase for Trustee ${i + 1} cannot be empty`);
      }

      const commitment = web3.utils.keccak256(`${share.x}:${share.y}`);
      commitments.push(commitment);

      const encryptedY = encryptShareY(share.y, passphrase);
      const fileData = {
        share_index: i + 1,
        x: share.x,
        encrypted_y: encryptedY,
        v_i: share.v_i,
        v: vGenerator,
        trustee: trusteeAddresses[i],
        distributed_at: new Date().toISOString(),
      };

      const shareFilePath = path.join(sharesDir, `trustee_${i + 1}.json`);
      fs.writeFileSync(shareFilePath, JSON.stringify(fileData, null, 2));
      console.log(`Saved encrypted share: ${shareFilePath}`);
    }
  } finally {
    rl.close();
  }

  const verificationData = {
    v: vGenerator,
    shares: shares.map((s, idx) => ({
      trustee: trusteeAddresses[idx],
      share_index: s.x,
      v_i: s.v_i,
    })),
  };

  const reactConfigDir = path.join(__dirname, "..", "dapp", "src", "config");
  fs.mkdirSync(reactConfigDir, { recursive: true });
  fs.writeFileSync(
    path.join(reactConfigDir, "verification_shares.json"),
    JSON.stringify(verificationData, null, 2),
  );

  return commitments;
}

async function getFeeOverrides(web3) {
  const minPriorityGwei = BigInt(process.env.MIN_PRIORITY_FEE_GWEI ?? "25");
  const minPriorityFeePerGas = minPriorityGwei * 1_000_000_000n;

  let suggestedPriorityFeePerGas = minPriorityFeePerGas;
  try {
    const rpcTip = await web3.eth.call({
      to: "0x0000000000000000000000000000000000000000",
      data: "0x",
    });
    void rpcTip;
  } catch {
    // no-op: not all providers support extra tip helper calls via web3 wrappers
  }

  const latestBlock = await web3.eth.getBlock("latest");
  const baseFeePerGas = latestBlock.baseFeePerGas
    ? BigInt(latestBlock.baseFeePerGas.toString())
    : BigInt(await web3.eth.getGasPrice());

  const maxPriorityFeePerGas =
    suggestedPriorityFeePerGas > minPriorityFeePerGas
      ? suggestedPriorityFeePerGas
      : minPriorityFeePerGas;
  const maxFeePerGas = baseFeePerGas * 2n + maxPriorityFeePerGas;

  return {
    maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
    maxFeePerGas: maxFeePerGas.toString(),
  };
}

async function main() {
  const networkName = process.env.DEPLOY_NETWORK || process.env.HARDHAT_NETWORK || "amoy";
  const rpcUrl = getRpcUrl(networkName);

  console.log("\n========================================");
  console.log("Running Phase 1 setup");
  console.log("Network:", networkName);
  console.log("RPC:", rpcUrl);
  console.log("========================================");

  const deployment = loadDeployment(networkName);
  const artifact = loadContractArtifact();

  if (!Web3Ctor) {
    throw new Error("Unable to resolve Web3 constructor from web3 package");
  }

  const web3 = new Web3Ctor(rpcUrl);
  const contract = new web3.eth.Contract(artifact.abi, deployment.mainContract.address);

  let adminAccount = getAdminAccount(web3);
  if (!adminAccount) {
    const accounts = await web3.eth.getAccounts();
    if (!accounts.length) {
      throw new Error("No admin account available. Set PRIVATE_KEY for this network.");
    }
    adminAccount = accounts[0];
  }

  console.log("Admin:", adminAccount);
  console.log("Contract:", deployment.mainContract.address);

  const threshold = Number(await contract.methods.threshold().call());
  const numTrustees = Number(await contract.methods.numTrustees().call());
  const trusteeAddresses = await contract.methods.getTrusteeAddresses().call();
  const feeOverrides = await getFeeOverrides(web3);

  const keyData = await generatePaillierKeypair();

  await contract.methods.setPaillierPublicKey(keyData.public_key_n).send({
    from: adminAccount,
    gas: 3_000_000,
    ...feeOverrides,
  });
  console.log("Public key stored on-chain");

  const split = await splitPrivateKey(
    keyData.private_key_lambda,
    keyData.private_key_mu,
    keyData.public_key_n,
    threshold,
    numTrustees,
  );

  const commitments = await distributeShares(web3, split.shares, split.v, trusteeAddresses);

  for (let i = 0; i < trusteeAddresses.length; i++) {
    await contract.methods.submitShareCommitment(trusteeAddresses[i], commitments[i]).send({
      from: adminAccount,
      gas: 1_000_000,
      ...feeOverrides,
    });
  }
  console.log("Share commitments submitted");

  console.log("\nPhase 1 setup completed successfully.");
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export default main;
