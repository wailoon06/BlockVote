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
  mainContract: { address: `0x${string}` };
  verifier: { address: `0x${string}` };
};

type HardhatArtifact = {
  contractName: string;
  abi: unknown[];
  bytecode: string;
  deployedBytecode: string;
};

function loadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function makeFrontendArtifact(artifact: HardhatArtifact, address: string, chainId: number) {
  return {
    contractName: artifact.contractName,
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    deployedBytecode: artifact.deployedBytecode,
    networks: {
      [String(chainId)]: {
        links: {},
        events: {},
        address,
      },
    },
    schemaVersion: "3.4.16",
    updatedAt: new Date().toISOString(),
    networkType: "ethereum",
  };
}

async function main() {
  const networkName = process.env.DEPLOY_NETWORK ?? process.env.HARDHAT_NETWORK ?? "localhost";

  const projectRoot = path.resolve(__dirname, "..");
  const deploymentPath = path.join(projectRoot, "deployments", `${networkName}.json`);

  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found: ${deploymentPath}. Run deploy script first.`);
  }

  const deployment = loadJson<DeploymentRecord>(deploymentPath);

  const contractArtifactPath = path.join(
    projectRoot,
    "artifacts",
    "contracts",
    "contract.sol",
    "Contract.json",
  );
  const verifierArtifactPath = path.join(
    projectRoot,
    "artifacts",
    "contracts",
    "Verifier.sol",
    "Groth16Verifier.json",
  );

  const contractArtifact = loadJson<HardhatArtifact>(contractArtifactPath);
  const verifierArtifact = loadJson<HardhatArtifact>(verifierArtifactPath);

  const frontendContract = makeFrontendArtifact(
    contractArtifact,
    deployment.mainContract.address,
    deployment.chainId,
  );
  const frontendVerifier = makeFrontendArtifact(
    verifierArtifact,
    deployment.verifier.address,
    deployment.chainId,
  );

  const dappSrc = path.resolve(projectRoot, "..", "dapp", "src");
  fs.mkdirSync(dappSrc, { recursive: true });

  const contractOutput = path.join(dappSrc, "contract.json");
  const verifierOutput = path.join(dappSrc, "Verifier.json");

  fs.writeFileSync(contractOutput, JSON.stringify(frontendContract, null, 2));
  fs.writeFileSync(verifierOutput, JSON.stringify(frontendVerifier, null, 2));

  console.log("Exported frontend artifacts:");
  console.log(" -", contractOutput);
  console.log(" -", verifierOutput);
  console.log("Chain ID:", deployment.chainId);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
