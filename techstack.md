# BlockVote — Tech Stack & Development Environment

## Table of Contents
1. [Programming Languages](#1-programming-languages)
2. [Frontend Stack](#2-frontend-stack)
3. [Smart Contract Stack](#3-smart-contract-stack)
4. [Backend Stack (Python)](#4-backend-stack-python)
5. [Cryptography & ZKP Tools](#5-cryptography--zkp-tools)
6. [External Services & Infrastructure](#6-external-services--infrastructure)
7. [System Environment](#7-system-environment)
8. [Local Development Environment Setup](#8-local-development-environment-setup)
9. [Directory Structure Summary](#9-directory-structure-summary)

---

## 1. Programming Languages

| Language | Version | Used For |
|---|---|---|
| **JavaScript** (ESM) | ES2022+ | React frontend (`dapp/`), deployment scripts, Node.js smart-contract utilities |
| **JavaScript** (CommonJS) | Node.js 18+ | Smart-contract tooling (`smart-contract/`), migration scripts, Truffle exec scripts |
| **Solidity** | `0.8.19` | On-chain voting logic (`contract.sol`, `Verifier.sol`) |
| **Python** | 3.x (venv) | Paillier crypto, Shamir secret sharing, homomorphic aggregation, identity verification server |
| **Circom** | 2.0 | ZKP circuit definition (`circuits/regCheck.circom`) |
| **PowerShell** | 5.1 (Windows) | Deployment automation (`deploy.ps1`) |

---

## 2. Frontend Stack

**Location:** `dapp/`

### Core Framework

| Package | Version | Role |
|---|---|---|
| `react` | `^19.2.0` | UI rendering (concurrent mode) |
| `react-dom` | `^19.2.0` | DOM reconciliation |
| `react-router-dom` | `^7.9.4` | Client-side routing (17 routes) |

### Build Tooling

| Package | Version | Role |
|---|---|---|
| `vite` | `^7.3.1` | Dev server + production bundler (ESM-native) |
| `@vitejs/plugin-react` | `^5.1.2` | Vite plugin for JSX/React fast-refresh |
| `vite-plugin-node-polyfills` | `^0.25.0` | Node.js shims in the browser (`Buffer`, `process`, `global`, `stream`, `events`, `util`) required by `snarkjs` and `web3` |

### Blockchain Interaction

| Package | Version | Role |
|---|---|---|
| `web3` | `^4.16.0` | Ethereum JSON-RPC client; contract ABI calls; account management |

### Cryptographic Libraries (client-side)

| Package | Version | Role |
|---|---|---|
| `snarkjs` | `^0.7.6` | Groth16 ZKP proof generation in the browser (`groth16.fullProve`) |
| `circomlibjs` | `^0.1.7` | Poseidon hash (BN254) — commitment and nullifier computation |
| `buffer` | `^6.0.3` | Node.js `Buffer` polyfill required by `snarkjs` |

### UI

| Package | Version | Role |
|---|---|---|
| `bootstrap` | `^5.3.8` | CSS utility framework; grid, modals, badges, buttons |

### Testing (not yet fully wired)

| Package | Version | Role |
|---|---|---|
| `@testing-library/react` | `^16.3.0` | React component unit tests |
| `@testing-library/jest-dom` | `^6.9.1` | Custom DOM matchers |
| `@testing-library/user-event` | `^13.5.0` | User interaction simulation |
| `web-vitals` | `^2.1.4` | Core Web Vitals measurement |

### Dev Tools

| Package | Version | Role |
|---|---|---|
| `prettier` | `^3.6.2` | Code formatter |

### Vite Configuration Notes

- `esbuild.loader: 'jsx'` applied to all `src/**/*.js` files (allows JSX in `.js`)
- `define: { 'process.env': {}, global: 'globalThis' }` → manual globals injection
- `optimizeDeps.esbuildOptions.define.global: 'globalThis'` → prevents `ReferenceError: global is not defined` from Web3
- `resolve.alias: { buffer: 'buffer' }` → routes Node.js `buffer` to the polyfill

---

## 3. Smart Contract Stack

**Location:** `smart-contract/`

### Solidity Compiler Settings

| Setting | Value | Reason |
|---|---|---|
| **Solidity version** | `0.8.19` | Fixed — `contract.sol` uses 0.8.x features (custom errors, `unchecked`) |
| **Optimizer** | `enabled: true, runs: 1` | Minimises deployed bytecode size (prioritises deploy cost over per-call gas) |
| **EVM version** | `london` | Pre-Shanghai; compatible with Ganache's default chain |
| **viaIR** | `true` | IR-based code generation — avoids "Stack too deep" errors in the large `vote()` function |

### Development Framework

| Tool | Role |
|---|---|
| **Truffle 5** | Compile, migrate, exec scripts |
| **truffle-contract `4.0.31`** | Contract abstraction used in Node scripts |
| **Ganache** (GUI or CLI) | Local EVM chain — `127.0.0.1:7545`, network ID `5777` |

### Node.js Utilities (smart-contract/package.json)

| Package | Version | Role |
|---|---|---|
| `web3` | `^4.16.0` | On-chain calls in deployment scripts |
| `axios` | `^1.13.5` | HTTP calls to IPFS API from Phase 3 aggregation scripts |
| `express` | `^5.1.0` | Minimal HTTP wrapper (unused in production path) |
| `form-data` | `^4.0.5` | Multipart form data for IPFS uploads from Node |
| `dotenv` | `^17.2.3` | `.env` support for secrets/config |
| `body-parser` | `^2.2.0` | Express middleware |

### Contracts

| File | Purpose |
|---|---|
| `contracts/contract.sol` | Main voting contract (~1252 lines); all business logic, ZKP validation, tally, results |
| `contracts/Verifier.sol` | `Groth16Verifier` — auto-generated by `snarkjs` from the circuit; BN128 pairing-based proof verifier |

---

## 4. Backend Stack (Python)

**Location:** `backend/`  
**Environment:** `venv/` at project root  
**Runtime:** Python 3.x

### Web Server

| Package | Role |
|---|---|
| `flask` | Lightweight HTTP server (identity verification endpoint on `:5000`) |
| `flask-cors` | Enables CORS so the React app can call `http://localhost:5000` |

### Computer Vision / OCR

| Package | Role |
|---|---|
| `easyocr` | OCR engine using PyTorch — extracts text from Malaysian IC card images (front + back). Configured for `['en', 'ms']`, `gpu=False` |
| `opencv-python` (`cv2`) | Image loading and pre-processing (decodes uploaded image bytes to NumPy array) |
| `numpy` | Numeric array operations for image data |

### Face Recognition

| Package | Role |
|---|---|
| `deepface` | Face verification using `Facenet512` model; compares selfie against IC photo; returns `{ verified, distance }` |

### Pure-Python Crypto (no third-party dependencies)

| Module | Role |
|---|---|
| `paillier_crypto.py` | Paillier keypair generation, encryption, decryption (1024-bit, stdlib `math` + `random` only) |
| `shamir_sharing.py` | Shamir Secret Sharing implementation over the integers (no external lib) |
| `homomorphic_aggregator.py` | Reads IPFS ballot list, multiplies ciphertexts mod n² |
| `vote_encryptor.py` | Computes `voteBlock`, radix-encodes candidate index, Paillier encrypts |

---

## 5. Cryptography & ZKP Tools

### Zero-Knowledge Proofs

| Tool | Version | Role |
|---|---|---|
| **Circom** | 2.0 | Circuit language; compiles `regCheck.circom` → `.wasm` + `.r1cs` |
| **snarkjs** | 0.7.6 | Groth16 trusted setup (Phase 1 + 2), proof generation, verifier Solidity export |
| **circomlibjs** | 0.1.7 | BN254 Poseidon hash in JS/browser |
| **Hermez BN128 Powers of Tau** | Phase 1 SRS | `powersOfTau28_hez_final_10.ptau` used in `regCheck_final.zkey` generation |

**Proof system:** Groth16 over BN254 (alt-BN128)  
**Proving key:** `dapp/public/zkp/regCheck_final.zkey`  
**Verification key:** `smart-contract/verification_key.json`  
**WASM witness generator:** bundled alongside the `.zkey` in `dapp/public/zkp/`

### Paillier Homomorphic Encryption

- **Implementation:** Pure-Python (`paillier_crypto.py`) — no external crypto library
- **Key size:** 1024-bit modulus $n = p \cdot q$ (two 512-bit primes), generated with `random.getrandbits` + Miller-Rabin primality test
- **Scheme:** Textbook Paillier (Damgård–Jurik simplified)
- **Key distribution:** Shamir 2-of-3 — shares stored in `trustee_shares/trustee_N.json` as AES-256-GCM encrypted JSON
- **Client-side encryption:** BigInt arithmetic in `dapp/src/utils/voteEncryption.js`

---

## 6. External Services & Infrastructure

| Service | Access | Purpose |
|---|---|---|
| **Ganache** | `http://127.0.0.1:7545` | Local Ethereum blockchain; 10 funded test accounts |
| **IPFS Desktop** | `http://127.0.0.1:5001` (HTTP API) | Decentralised ballot storage; `add`, `pin`, `cat`, `version` endpoints |
| **Python Backend** | `http://localhost:5000` | IC + face identity verification via OCR + DeepFace |
| **MetaMask** | Browser extension | Wallet management; transaction signing; `window.ethereum` provider injected into dApp |

---

## 7. System Environment

| Component | Value |
|---|---|
| **OS** | Windows 10/11 (PowerShell 5.1 scripts) |
| **Shell** | PowerShell (`deploy.ps1`, activation scripts) |
| **Node.js** | 18+ (ESM support required for `dapp/`, CommonJS for `smart-contract/`) |
| **npm** | Bundled with Node.js |
| **Python** | 3.x, isolated in `c:\Users\ASUS\Projects\BlockVote\venv\` |
| **Truffle** | Installed globally — `truffle` command available in PATH |
| **Ganache** | Installed globally or as GUI desktop app |
| **IPFS Desktop** | Installed globally; HTTP API enabled on port 5001 |
| **MetaMask** | Chrome/Firefox browser extension |
| **Circom** | Installed globally — required only if re-compiling the circuit |

---

## 8. Local Development Environment Setup

### 8.1 First-Time Setup

#### Node dependencies

```powershell
# Frontend
cd dapp
npm install

# Smart-contract utilities
cd ..\smart-contract
npm install
```

#### Python venv

```powershell
# From project root
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install flask flask-cors easyocr deepface opencv-python numpy
```

#### Circom (only if re-compiling the circuit)

```powershell
npm install -g circom        # or install via Rust cargo
npm install -g snarkjs
```

---

### 8.2 Starting Services (before every session)

Each of the following must be running before deploying or using the dApp:

#### 1. Ganache

Start **Ganache GUI** and configure workspace:

| Setting | Value |
|---|---|
| Hostname | `127.0.0.1` |
| Port | `7545` |
| Network ID | `5777` |
| Accounts | ≥ 10 (default) |

Or start Ganache CLI:

```powershell
ganache --port 7545 --networkId 5777 --accounts 10 --deterministic
```

#### 2. IPFS Desktop

Launch IPFS Desktop. Verify the HTTP API is enabled at `127.0.0.1:5001`.  
To check:

```powershell
curl http://127.0.0.1:5001/api/v0/version -X POST
```

Expected: `{ "Version": "0.x.x", ... }`

> **CORS note:** IPFS Desktop must allow requests from `http://localhost:5173`. Add the origin in IPFS Desktop → Settings → API, or via:
> ```
> ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["http://localhost:5173"]'
> ```

#### 3. Python Identity Verification Server

```powershell
cd backend
..\venv\Scripts\Activate.ps1
python verification.py
```

Server starts on `http://localhost:5000`.  
First launch downloads EasyOCR models and DeepFace weights — may take a few minutes.

---

### 8.3 Deployment (per Ganache reset)

Run the full deploy script from the project root:

```powershell
.\deploy.ps1
```

What it does (6 steps):

| Step | Action |
|---|---|
| 1 | `truffle migrate --reset --network development` — compiles and deploys `Contract.sol` + `Groth16Verifier.sol` to Ganache |
| 2 | Confirms Groth16Verifier is wired via `set-verifier.js` |
| 2.5 | `node phase1-setup.js` — generates Paillier keypair; Shamir-splits private key; calls `setPaillierPublicKey` + `submitShareCommitment` × 3; writes `trustee_shares/trustee_N.json` |
| 3 | Copies `Contract.json` → `dapp/src/contract.json`, `Groth16Verifier.json` → `dapp/src/Verifier.json` |
| 4 | Extracts deployed contract + verifier addresses from build artifacts (network ID `5777`) |
| 5 | Patches verifier address into `dapp/src/config/zkpConfig.js` |
| 6 | Reads and displays Paillier public key N from chain |

> **Trustee accounts:** `accounts[1]`, `accounts[2]`, `accounts[3]` from Ganache are the three trustee wallets. Import them into MetaMask to test Phase 4 decryption.

---

### 8.4 Running the Frontend

```powershell
cd dapp
npm run dev       # Vite dev server with HMR
```

Dev server: `http://localhost:5173`

```powershell
npm run build     # Production bundle → dapp/dist/
npm run preview   # Serve the production build locally
```

---

### 8.5 Health Check

Before testing, run the built-in health check from `smart-contract/`:

```powershell
cd smart-contract
node health-check.js
```

Checks:
1. Ganache reachable at `:7545`
2. `Contract.json` present and deployed to current network
3. Paillier key set on-chain
4. All 3 trustee commitments submitted
5. Phase 2 functions present in ABI
6. ≥ 10 test accounts available
7. `dapp/src/contract.json` up to date
8. Backend Python files present
9. IPFS API reachable (warning-only)

---

### 8.6 Typical Development Workflow

```
1. Start Ganache
2. Start IPFS Desktop
3. Start Python backend (verification.py)
4. Run .\deploy.ps1 (once per Ganache reset / contract change)
5. cd dapp && npm run dev
6. Open http://localhost:5173 in browser with MetaMask
7. Connect MetaMask to Ganache (Custom RPC: 127.0.0.1:7545, chain ID 1337 or 5777)
8. Import test accounts into MetaMask as needed
```

---

## 9. Directory Structure Summary

```
BlockVote/
├── deploy.ps1                  PowerShell full-deploy script
├── README.md
├── venv/                       Python virtual environment
│
├── backend/                    Python backend services
│   ├── verification.py         Flask server — OCR + face recognition (:5000)
│   ├── paillier_crypto.py      Paillier key-gen, encrypt, decrypt
│   ├── shamir_sharing.py       Shamir secret splitting + reconstruction
│   ├── vote_encryptor.py       CLI: radix-encode + encrypt vote
│   └── homomorphic_aggregator.py  CLI: multiply Paillier ciphertexts
│
├── circuits/
│   └── regCheck.circom         Groth16 ZKP circuit (Circom 2.0)
│
├── smart-contract/             Truffle project
│   ├── truffle-config.js       Compiler + network config
│   ├── package.json            Node dependencies (CommonJS)
│   ├── contracts/
│   │   ├── contract.sol        Main voting contract (Solidity 0.8.19)
│   │   └── Verifier.sol        snarkjs-generated Groth16 verifier
│   ├── migrations/
│   │   ├── 2_migrate.js        Deploys Contract.sol
│   │   └── 3_deploy_verifier.js  Deploys Verifier + wires to Contract
│   ├── build/contracts/        Compiled ABI + bytecode (Truffle output)
│   ├── phase1-setup.js         Paillier setup + trustee share distribution
│   ├── phase2-vote.js          Phase 2 test helper
│   ├── phase3-aggregate.js     Homomorphic tally aggregation
│   ├── set-verifier.js         Verifier linkage confirmation
│   ├── health-check.js         9-point system health check
│   ├── ipfs-manager.js         Node IPFS HTTP API client
│   ├── verification_key.json   Groth16 verification key
│   └── trustee_shares/         Encrypted Shamir share files (gitignore candidate)
│       ├── trustee_1.json
│       ├── trustee_2.json
│       └── trustee_3.json
│
└── dapp/                       React + Vite frontend
    ├── package.json            Node dependencies (ESM)
    ├── vite.config.js          Vite + polyfills config
    ├── public/
    │   └── zkp/
    │       └── regCheck_final.zkey   Groth16 proving key
    └── src/
        ├── App.js              Router + role dispatch
        ├── contract.json       Copied from build (post-deploy)
        ├── Verifier.json       Copied from build (post-deploy)
        ├── config/
        │   └── zkpConfig.js    Verifier address + artifact URLs (patched by deploy.ps1)
        ├── components/         Navbar, Sidebar, RoleSelectionModal, MessageAlert
        ├── pages/              17 route components (per role)
        └── utils/              contractUtils, ipfsClient, voteEncryption,
                                zkpProofGenerator, poseidonUtils,
                                homomorphicAggregator, thresholdDecryption,
                                icHashUtils, zkpArtifactLoader
```
