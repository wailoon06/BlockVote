import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

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
            // If user cancels, just continue with eth_requestAccounts
            if (permError.code !== 4001) {
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
          
          
          // Navigate to register page with wallet address
          setTimeout(() => {
            navigate('/register', { state: { walletAddress: accounts[0] } });
          }, 1000);
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
            VoteChain
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
              <span style={{ color: 'white' }}>
                {walletAddress.substring(0, 6)}...{walletAddress.substring(38)}
              </span>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '3rem 1rem' }}>
        <div style={{ textAlign: 'center', maxWidth: '800px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '1.5rem' }}>
            Welcome to Blockchain Voting
          </h1>
          <p style={{ fontSize: '1.25rem', marginBottom: '2rem', color: '#6c757d' }}>
            Secure, transparent, and decentralized voting platform powered by blockchain technology.
            Democracy reimagined for the digital age.
          </p>

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
            <h3 style={{ marginBottom: '1.5rem' }}>Random Words in the Middle</h3>
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