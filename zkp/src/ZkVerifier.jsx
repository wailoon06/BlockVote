import React, { useState } from "react";
import * as snarkjs from "snarkjs";
import { ethers } from "ethers";
import VerifierJson from "./abi/Verifier.json";

const VERIFIER_ADDRESS = "0xDF86cFdce579E4D9876BCE8d58F3B7Ff9aA4633A";

export default function ZkVerify() {
  const [age, setAge] = useState("18");
  const [status, setStatus] = useState("");

  async function proveAndVerify() {
    try {
      if (!window.ethereum) throw new Error("MetaMask not found");
      await window.ethereum.request({ method: "eth_requestAccounts" });

      setStatus("Generating proof in browser...");
      const input = { age: age.toString() };

      const wasmPath = new URL("/zkp/agecheck.wasm", window.location.origin).toString();
      const zkeyPath = new URL("/zkp/agecheck_final.zkey", window.location.origin).toString();

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        wasmPath,
        zkeyPath
      );

      // publicSignals should be ["1"] if age >= 18
      setStatus(`Proof generated. publicSignals=${JSON.stringify(publicSignals)}`);

      setStatus("Formatting calldata...");
      const calldataStr = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
      const argv = JSON.parse("[" + calldataStr + "]");

      const a = argv[0];
      const b = argv[1];
      const c = argv[2];
      const inputSignals = argv[3]; // fixed-size array under the hood

      setStatus("Calling on-chain verifier...");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      const verifier = new ethers.Contract(
        VERIFIER_ADDRESS,
        VerifierJson.abi,
        signer
      );

      const ok = await verifier.verifyProof(a, b, c, inputSignals);
      setStatus(ok ? "✅ Verified on-chain (age >= 18)!" : "❌ Verification failed.");
    } catch (e) {
      console.error(e);
      // Improve error message for assertion failures (e.g. age < 18)
      if (e?.message?.includes("Assert Failed")) {
        setStatus("❌ Proof failed: You must be at least 18 to generate a proof.");
      } else {
        setStatus("Error: " + (e?.message || String(e)));
      }
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h2>Age Eligibility ZK (age ≥ 18)</h2>

      <label>
        Age
        <input
          value={age}
          onChange={(e) => setAge(e.target.value)}
          style={{ width: "100%", padding: 8, marginTop: 6 }}
        />
      </label>

      <button onClick={proveAndVerify} style={{ padding: "10px 14px", marginTop: 12 }}>
        Prove & Verify
      </button>

      <p style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>{status}</p>

      <hr />
      <div style={{ fontSize: 13, opacity: 0.8 }}>
        Check these URLs:
        <div><a href="/zkp/agecheck.wasm" target="_blank">/zkp/agecheck.wasm</a></div>
        <div><a href="/zkp/agecheck_final.zkey" target="_blank">/zkp/agecheck_final.zkey</a></div>
      </div>
    </div>
  );
}
