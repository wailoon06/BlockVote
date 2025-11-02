import React, { useEffect, useState } from "react";
import Web3 from "web3";
import RegisterContract from "../Register.json";

function Register() {
  const [account, setAccount] = useState("");
  const [contract, setContract] = useState(null);
  const [name, setName] = useState("");
  const [ic, setIC] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadBlockchain();
  }, []);

  async function loadBlockchain() {
    const web3 = new Web3(window.ethereum);
    await window.ethereum.request({ method: "eth_requestAccounts" });
    const accounts = await web3.eth.getAccounts();
    setAccount(accounts[0]);

    const deployedNetwork = RegisterContract.networks[5777];

    const instance = new web3.eth.Contract(
      RegisterContract.abi,
      deployedNetwork && deployedNetwork.address
    );
    setContract(instance);
  }

  async function registerUser() {
    if (!contract) {
      setMessage("Smart contract not loaded yet!");
      return;
    }

    if (!name || !ic) {
      setMessage("Please fill in all fields");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      await contract.methods
        .registerUser(name, ic)
        .send({ from: account });

      setMessage("✅ User registered successfully!");
      setName("");
      setIC("");
    } catch (error) {
      setMessage("❌ Error: " + error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container">
      <h1>Register User</h1>
      
      {account && (
        <div className="account-info">
          Connected: {account}
        </div>
      )}

      <input
        className="form-input-full"
        placeholder="Name"
        value={name}
        onChange={e => setName(e.target.value)}
      />
      <input
        className="form-input-full"
        placeholder="IC Number"
        type="number"
        value={ic}
        onChange={e => setIC(e.target.value)}
      />
      
      <button 
        className="btn-full" 
        onClick={registerUser}
        disabled={loading}
      >
        {loading ? "Registering..." : "Register"}
      </button>

      {message && (
        <div className={message.includes("✅") ? "alert alert-success" : "alert alert-error"}>
          {message}
        </div>
      )}
    </div>
  );
}

export default Register;