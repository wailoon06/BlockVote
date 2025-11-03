import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import VoterRegisterContract from "../Voter_Register.json";

export default function Register() {
  const location = useLocation();
  const walletAddress = location.state?.walletAddress || '';

  const [formData, setFormData] = useState({
    name: '',
    ic: '',
    email: ''
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  
  useEffect(() => {
    if (!walletAddress) {
      setMessage('Please connect your wallet first');
      setMessageType('danger');
    }
  }, [walletAddress]);

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
        // Check if MetaMask is available
      if (typeof window.ethereum === 'undefined') {
        throw new Error('MetaMask not found');
      }

      // Import Web3
      const Web3 = (await import('web3')).default;
      const web3 = new Web3(window.ethereum);
      
      // Get contract instance
      const deployedNetwork = VoterRegisterContract.networks[5777];
      if (!deployedNetwork) {
        throw new Error('Contract not deployed on this network!');
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
        throw new Error('Wallet address already registered');
      }

      // Register voter - sends IC hash, not plaintext
      const result = await contract.methods
        .registerVoter(formData.name, formData.ic, formData.email)
        .send({ from: walletAddress });

      setMessage('Registration successful! Please check your email for verification code.');
      setMessageType('success');
      
      // Clear form
      setFormData({ name: '', ic: '', email: '' });
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

  
  return (
    <div style={{ maxWidth: '600px', margin: '0 auto' }}>
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
  );
}