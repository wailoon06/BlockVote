import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import VoterRegisterContract from "../Voter_Register.json";

export default function Register() {
  const location = useLocation();
  const navigate = useNavigate();
  const walletAddress = location.state?.walletAddress || '';

  const [formData, setFormData] = useState({
    name: '',
    ic: '',
    email: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [checking, setChecking] = useState(true);
  
  useEffect(() => {
    if (!walletAddress) {
      setMessage('Please connect your wallet first');
      setMessageType('danger');
      setChecking(false);
      // Redirect to home after 2 seconds
      setTimeout(() => navigate('/'), 2000);
    } else {
      checkVoterStatus();
    }
  }, [walletAddress]);

  const checkVoterStatus = async () => {
    try {
      if (typeof window.ethereum === 'undefined') {
        throw new Error('MetaMask not found');
      }

      const Web3 = (await import('web3')).default;
      const web3 = new Web3(window.ethereum);
      
      // Try to find deployed contract
      const chainId = await web3.eth.getChainId();
      const networkId = await web3.eth.net.getId();
      const possibleIds = [chainId, networkId, 5777, 1337];
      let deployedNetwork = null;
      for (const id of possibleIds) {
        if (VoterRegisterContract.networks[id]) {
          deployedNetwork = VoterRegisterContract.networks[id];
          break;
        }
      }
      if (!deployedNetwork) {
        throw new Error('Contract not deployed!');
      }

      const contract = new web3.eth.Contract(
        VoterRegisterContract.abi,
        deployedNetwork.address
      );

      // Check if wallet is already registered
      const isRegistered = await contract.methods
        .isWalletRegistered(walletAddress)
        .call();

      if (isRegistered) {
        // Get voter info to check status
        const voterInfo = await contract.methods.getVoterInfo(walletAddress).call();
        
        if (voterInfo.status === 'PENDING_VERIFICATION') {
          // Redirect to verification page
          navigate('/verify', { state: { walletAddress } });
        } else if (voterInfo.status === 'VERIFIED') {
          // Redirect to home page
          navigate('/', { state: { message: 'You are already registered and verified!' } });
        }
      }
      
      setChecking(false);
    } catch (error) {
      console.error('Error checking voter status:', error);
      setChecking(false);
    }
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const logout = () => {
    // Clear state and redirect to home (without wallet address state)
    navigate('/', { replace: true });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      // Check if wallet is connected
      if (!walletAddress) {
        throw new Error('Please connect your wallet first');
      }

      // Check if MetaMask is available
      if (typeof window.ethereum === 'undefined') {
        throw new Error('MetaMask not found');
      }

      // Import Web3
      const Web3 = (await import('web3')).default;
      const web3 = new Web3(window.ethereum);
      
      // Get contract instance
      const chainId = await web3.eth.getChainId();
      const networkId = await web3.eth.net.getId();
      const possibleIds = [chainId, networkId, 5777, 1337];
      let deployedNetwork = null;
      for (const id of possibleIds) {
        if (VoterRegisterContract.networks[id]) {
          deployedNetwork = VoterRegisterContract.networks[id];
          break;
        }
      }
      if (!deployedNetwork) {
        throw new Error('Contract not deployed!');
      }
      
      const contract = new web3.eth.Contract(
        VoterRegisterContract.abi,
        deployedNetwork.address
      );

      // Register voter - sends IC hash, not plaintext
      const result = await contract.methods
        .registerVoter(formData.name, formData.ic, formData.email)
        .send({ from: walletAddress });

      setMessage('Registration successful! Redirecting to verification...');
      setMessageType('success');
      
      // Clear form
      setFormData({ name: '', ic: '', email: '' });
      
      // Redirect to verification page after successful registration
      setTimeout(() => {
        navigate('/verify', { state: { walletAddress } });
      }, 2000);
    } catch (error) {
      let errorMsg = 'Registration failed';
      
      if (error.message.includes('IC number already registered')) {
        errorMsg = 'This IC number is already registered. Please check your details.';
      } else if (error.message.includes('Email already registered')) {
        errorMsg = 'This email is already registered. Please use a different email.';
      } else if (error.message.includes('Wallet address already registered')) {
        errorMsg = 'This wallet is already registered. Please use a different wallet.';
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      setMessage(errorMsg);
      setMessageType('danger');
    }

    setLoading(false);
  };

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Checking registration status...</div>
        </div>
      </div>
    );
  }

  
  
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
            VoteChain - Registration
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontFamily: 'monospace' }}>
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
        </div>
      </nav>

      {/* Main Content */}
      <div style={{ maxWidth: '600px', margin: '3rem auto', padding: '0 1rem' }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        boxShadow: '0 0.5rem 1rem rgba(0,0,0,0.15)',
        padding: '3rem'
      }}>
        <h2 style={{ textAlign: 'center', marginBottom: '2rem' }}>
          Voter Registration
        </h2>
        
        {message && (
          <div style={{
            backgroundColor: messageType === 'success' ? '#d1e7dd' : '#f8d7da',
            color: messageType === 'success' ? '#0f5132' : '#842029',
            padding: '1rem',
            borderRadius: '0.25rem',
            marginBottom: '1rem',
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

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Full Name
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ced4da',
              borderRadius: '0.25rem',
              fontSize: '1rem'
            }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            IC Number
          </label>
          <input
            type="text"
            name="ic"
            value={formData.ic}
            onChange={handleInputChange}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ced4da',
              borderRadius: '0.25rem',
              fontSize: '1rem'
            }}
          />
          <small style={{ color: '#6c757d', fontSize: '0.875rem' }}>
            Your IC will be hashed for privacy
          </small>
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Email Address
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ced4da',
              borderRadius: '0.25rem',
              fontSize: '1rem'
            }}
          />
        </div>

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Wallet Address
          </label>
          <input
            type="text"
            value={walletAddress}
            disabled
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ced4da',
              borderRadius: '0.25rem',
              fontSize: '1rem',
              backgroundColor: '#e9ecef',
              color: '#495057'
            }}
          />
        </div>

        <button 
          onClick={handleRegister}
          disabled={loading || !walletAddress}
          style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: loading || !walletAddress ? '#6c757d' : '#0d6efd',
            color: 'white',
            border: 'none',
            borderRadius: '0.25rem',
            fontSize: '1rem',
            cursor: (loading || !walletAddress) ? 'not-allowed' : 'pointer',
            fontWeight: '500'
          }}
        >
          {loading ? 'Registering...' : !walletAddress ? 'Connect Wallet First' : 'Register'}
        </button>
      </div>
      </div>
    </div>
  );
}