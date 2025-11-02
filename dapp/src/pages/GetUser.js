import React, { useState } from "react";
import Web3 from "web3";
import RegisterContract from "../Register.json";

function GetUser() {
  const [userId, setUserId] = useState("");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchUser() {
    if (!userId) {
      setError("Please enter a user ID");
      return;
    }

    setLoading(true);
    setError("");
    setUser(null);

    try {
      const web3 = new Web3(window.ethereum);
      await window.ethereum.request({ method: "eth_requestAccounts" });

      const deployedNetwork = RegisterContract.networks[5777];
      
      if (!deployedNetwork) {
        setError("Contract not deployed on this network");
        setLoading(false);
        return;
      }

      const contract = new web3.eth.Contract(
        RegisterContract.abi,
        deployedNetwork.address
      );

      const result = await contract.methods.getUser(userId).call();
      
      setUser({
        name: result[0],
        ic: result[1],
        wallet: result[2]
      });
    } catch (err) {
      console.error("Error fetching user:", err);
      setError(err.message || "User not found or error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container">
      <h1>Get User Details</h1>

      <div className="form-inline">
        <input
          className="form-input"
          type="number"
          placeholder="Enter User ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <button className="btn" onClick={fetchUser} disabled={loading}>
          {loading ? "Loading..." : "Get User"}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {user && (
        <div className="user-card">
          <h2>User Details</h2>
          <div className="detail-row">
            <strong>Name:</strong>
            <span>{user.name}</span>
          </div>
          <div className="detail-row">
            <strong>IC Number:</strong>
            <span>{user.ic}</span>
          </div>
          <div className="detail-row">
            <strong>Wallet:</strong>
            <span>{user.wallet}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default GetUser;