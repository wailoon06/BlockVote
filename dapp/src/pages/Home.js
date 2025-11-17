import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import VoterRegisterContract from "../Voter_Register.json";

export default function Home() {
  const [walletAddress, setWalletAddress] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const navigate = useNavigate();

  // Clear connection state on component mount
  useEffect(() => {
    // Reset all states when component mounts (on page refresh)
    setWalletAddress('');
    setIsConnected(false);
    setMessage('');
    
    // Add event listeners
    if (typeof window.ethereum !== 'undefined') {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('disconnect', handleDisconnect);
    }

    // Cleanup event listeners on unmount
    return () => {
      if (typeof window.ethereum !== 'undefined') {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('disconnect', handleDisconnect);
      }
    };
  }, []);

  const handleAccountsChanged = (accounts) => {
    if (accounts.length === 0) {
      // User disconnected their wallet
      setWalletAddress('');
      setIsConnected(false);
    } else if (accounts[0] !== walletAddress) {
      // User switched accounts
      setWalletAddress(accounts[0]);
      setIsConnected(true);
    }
  };

  const handleDisconnect = () => {
    setWalletAddress('');
    setIsConnected(false);
  };

  // Check voter status and navigate accordingly
  const checkVoterStatusAndNavigate = async (address) => {
    try {
      if (typeof window.ethereum === 'undefined') {
        throw new Error('MetaMask not found');
      }

      const Web3 = (await import('web3')).default;
      const web3 = new Web3(window.ethereum);
      
      // Try to find deployed contract - check both chain ID and common network IDs
      const chainId = await web3.eth.getChainId();
      const networkId = await web3.eth.net.getId();
      
      // Try chain ID first, then network ID, then common IDs
      const possibleIds = [chainId, networkId, 5777, 1337];
      let deployedNetwork = null;
      
      for (const id of possibleIds) {
        if (VoterRegisterContract.networks[id]) {
          deployedNetwork = VoterRegisterContract.networks[id];
          break;
        }
      }
      
      if (!deployedNetwork) {
        throw new Error(`Contract not deployed! Chain ID: ${chainId}, Network ID: ${networkId}. Make sure Ganache is running and contract is deployed.`);
      }

      const contract = new web3.eth.Contract(
        VoterRegisterContract.abi,
        deployedNetwork.address
      );

      // Verify contract exists at this address
      const code = await web3.eth.getCode(deployedNetwork.address);
      if (code === '0x' || code === '0x0') {
        throw new Error(`No contract found at address ${deployedNetwork.address}. Please re-deploy the contract with 'truffle migrate --reset'.`);
      }

      // Check if wallet is registered
      const isRegistered = await contract.methods
        .isWalletRegistered(address)
        .call();

      if (!isRegistered) {
        // Not registered - go to register page
        navigate('/register', { state: { walletAddress: address } });
      } else {
        // Registered - check status
        const voterInfo = await contract.methods.getVoterInfo(address).call();
        
        if (voterInfo.status === 'PENDING_VERIFICATION') {
          // Pending verification - go to verification page
          navigate('/verify', { state: { walletAddress: address } });
        } else if (voterInfo.status === 'VERIFIED') {
          // Already verified - stay on home page or go to voting page
          setMessage('Welcome back! You are already verified.');
          setMessageType('success');
          // Optionally navigate to a voting/dashboard page
          // navigate('/dashboard', { state: { walletAddress: address } });
        }
      }
    } catch (error) {
      console.error('Error checking voter status:', error);
      setMessage('Failed to check voter status: ' + error.message);
      setMessageType('danger');
    }
  };

  const connectWallet = async () => {
    try {
      if (typeof window.ethereum !== 'undefined') {
        // First, get current accounts to check if already connected
        const currentAccounts = await window.ethereum.request({ 
          method: 'eth_accounts' 
        });

        // If there are connected accounts, request to switch/select account
        // This forces MetaMask to show the popup even if previously connected
        if (currentAccounts.length > 0) {
          // Request wallet_requestPermissions to force account selection popup
          try {
            await window.ethereum.request({
              method: 'wallet_requestPermissions',
              params: [{
                eth_accounts: {}
              }]
            });
          } catch (permError) {
            // If user cancels, stop the connection process
            if (permError.code === 4001) {
              setMessage('Connection cancelled. Please try again.');
              setMessageType('danger');
              return; // Exit the function
            } else {
              console.log('Permission request failed:', permError);
            }
          }
        }

        // Request account access - this will show MetaMask popup
        const accounts = await window.ethereum.request({ 
          method: 'eth_requestAccounts' 
        });
        
        if (accounts.length > 0) {
          setWalletAddress(accounts[0]);
          setIsConnected(true);
          setMessage('Wallet connected successfully!');
          setMessageType('success');
          
          // Check voter status and navigate accordingly
          await checkVoterStatusAndNavigate(accounts[0]);
        }
      } else {
        setMessage('Please install MetaMask!');
        setMessageType('danger');
      }
    } catch (error) {
      if (error.code === 4001) {
        setMessage('Connection rejected. Please try again.');
      } else {
        setMessage('Failed to connect wallet: ' + error.message);
      }
      setMessageType('danger');
    }
  };

  const logout = () => {
    // Clear wallet connection state
    setWalletAddress('');
    setIsConnected(false);
    setMessage('Wallet disconnected successfully!');
    setMessageType('success');
    
    // Clear message after 3 seconds
    setTimeout(() => {
      setMessage('');
    }, 3000);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
      {/* Navigation */}
      <nav style={{ 
        backgroundColor: '#0d6efd', 
        padding: '1rem 0',
        color: 'white'
      }}>
        <div style={{ 
          maxWidth: '1200px', 
          margin: '0 auto', 
          padding: '0 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
            BlockVote
          </div>
          <div>
            {!isConnected ? (
              <button 
                onClick={connectWallet}
                style={{
                  backgroundColor: 'white',
                  color: '#0d6efd',
                  border: 'none',
                  padding: '0.5rem 1.5rem',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                Connect Wallet
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ color: 'white' }}>
                  {walletAddress.substring(0, 6)}...{walletAddress.substring(38)}
                </span>
                <button 
                  onClick={logout}
                  style={{
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '3rem 1rem' }}>
        <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
            Welcome to BlockVote
          </h1>
          {message && (
            <div style={{
              backgroundColor: messageType === 'success' ? '#d1e7dd' : '#f8d7da',
              color: messageType === 'success' ? '#0f5132' : '#842029',
              padding: '1rem',
              borderRadius: '0.25rem',
              marginBottom: '1rem',
              maxWidth: '500px',
              margin: '0 auto 2rem auto',
              position: 'relative'
            }}>
              {message}
              <button 
                onClick={() => setMessage('')}
                style={{
                  position: 'absolute',
                  right: '1rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: 'inherit'
                }}
              >
                ×
              </button>
            </div>
          )}

          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 0.5rem 1rem rgba(0,0,0,0.15)',
            padding: '3rem',
            marginTop: '3rem'
          }}>
            <h3 style={{ marginBottom: '1.5rem' }}>BlockVote</h3>
            <p style={{ color: '#6c757d', lineHeight: '1.8' }}>
              Innovation transparency immutable consensus distributed ledger cryptography 
              decentralization smart contracts verification authenticity reliability 
              empowerment participation governance integrity accountability trust
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}