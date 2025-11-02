import React, { useState, useEffect } from "react";
import Web3 from "web3";
import RegisterContract from "../Register.json";

function AllUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadAllUsers();
  }, []);

  async function loadAllUsers() {
    setLoading(true);
    setError("");

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

      const count = await contract.methods.userCount().call();
      const userList = [];

      for (let i = 1; i <= count; i++) {
        const result = await contract.methods.getUser(i).call();
        userList.push({
          id: i,
          name: result[0],
          ic: result[1],
          wallet: result[2]
        });
      }

      setUsers(userList);
    } catch (err) {
      console.error("Error loading users:", err);
      setError(err.message || "Error loading users");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="page-container-wide"><div className="loading"><h2>Loading users...</h2></div></div>;
  }

  if (error) {
    return <div className="page-container-wide"><div className="alert alert-error">{error}</div></div>;
  }

  return (
    <div className="page-container-wide">
      <h1>All Registered Users</h1>
      <p>Total Users: {users.length}</p>

      {users.length === 0 ? (
        <div className="alert alert-info">No users registered yet.</div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>IC Number</th>
                <th>Wallet Address</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td>{user.name}</td>
                  <td>{user.ic}</td>
                  <td>{user.wallet.slice(0, 6)}...{user.wallet.slice(-4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button className="btn" onClick={loadAllUsers}>
        Refresh
      </button>
    </div>
  );
}

export default AllUsers;