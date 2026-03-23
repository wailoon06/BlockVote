import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getDeployedContract } from '../utils/contractUtils';
import { hashIC, hashString } from '../utils/icHashUtils';
import Navbar from '../components/Navbar';
import MessageAlert from '../components/MessageAlert';

export default function CandidateRegister() {
  const location = useLocation();
  const navigate = useNavigate();
  const walletAddress = location.state?.walletAddress || '';

  const [formData, setFormData] = useState({
    name: '',
    ic: '',
    email: '',
    party: '',
    manifesto: ''
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
      setTimeout(() => navigate('/'), 2000);
    } else {
      checkCandidateStatus();
    }
  }, [walletAddress]);

  const checkCandidateStatus = async () => {
    try {
      const { deployedContract } = await getDeployedContract();

      const isRegistered = await deployedContract.methods
        .isWalletRegistered(walletAddress)
        .call();

      if (isRegistered) {
        const isCandidateRegistered = await deployedContract.methods
          .isCandidateRegistered(walletAddress)
          .call();
        
        if (isCandidateRegistered) {
          const candidateInfo = await deployedContract.methods.getCandidateInfo(walletAddress).call();
          
          if (candidateInfo.status === 'PENDING_VERIFICATION') {
            navigate('/candidate-verify', { state: { walletAddress } });
          } else if (candidateInfo.status === 'VERIFIED') {
            navigate('/', { state: { message: 'You are already registered and verified as a candidate!' } });
          }
        } else {
          navigate('/', { state: { message: 'You are already registered as a voter!' } });
        }
      }
      
      setChecking(false);
    } catch (error) {
      console.error('Error checking candidate status:', error);
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
    navigate('/', { replace: true });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      if (!walletAddress) {
        throw new Error('Please connect your wallet first');
      }

      const { web3, deployedContract } = await getDeployedContract();

      const icHash = hashIC(formData.ic);

      const result = await deployedContract.methods
        .registerCandidate(formData.name, icHash, formData.email, formData.party, formData.manifesto)
        .send({ 
          from: walletAddress,
          maxPriorityFeePerGas: web3.utils.toWei('30', 'gwei'), // Set above minimum 25 Gwei
          maxFeePerGas: web3.utils.toWei('45', 'gwei')
         });

      setMessage('Registration successful! Redirecting to verification...');
      setMessageType('success');
      
      setFormData({ name: '', ic: '', email: '', party: '', manifesto: '' });
      
      setTimeout(() => {
        navigate('/candidate-verify', { state: { walletAddress } });
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
      <div style={{ 
        minHeight: '100vh', 
        backgroundColor: '#f5f7fa', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            fontSize: '3rem', 
            marginBottom: '1rem',
            color: '#1e3a5f'
          }}>⏳</div>
          <div style={{ 
            fontSize: '1.25rem',
            color: '#6c757d',
            fontWeight: '500'
          }}>
            Checking registration status...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa' }}>
      <Navbar 
        title="BlockVote - Candidate Registration" 
        walletAddress={walletAddress} 
        onLogout={logout} 
      />

      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '0 1.5rem', paddingTop: 'calc(70px + 4rem)' }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          padding: '3rem',
          border: '1px solid #e8e8e8'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👔</div>
            <h2 style={{ 
              color: '#1e3a5f',
              fontSize: '1.75rem',
              fontWeight: '600',
              marginBottom: '0.5rem'
            }}>
              Candidate Registration
            </h2>
            <p style={{ color: '#6c757d', fontSize: '0.95rem' }}>
              Register to run for office and represent your community
            </p>
          </div>
        
          <MessageAlert 
            message={message} 
            type={messageType} 
            onClose={() => setMessage('')} 
          />

          <form onSubmit={handleRegister}>
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem', 
                fontWeight: '600',
                color: '#1e3a5f',
                fontSize: '0.95rem'
              }}>
                Full Name
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                placeholder="Enter your full name"
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  border: '1.5px solid #e0e0e0',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  transition: 'border-color 0.2s',
                  outline: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = '#1e3a5f'}
                onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem', 
                fontWeight: '600',
                color: '#1e3a5f',
                fontSize: '0.95rem'
              }}>
                IC Number
              </label>
              <input
                type="text"
                name="ic"
                value={formData.ic}
                onChange={handleInputChange}
                required
                placeholder="e.g., 990101-01-1234"
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  border: '1.5px solid #e0e0e0',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  transition: 'border-color 0.2s',
                  outline: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = '#1e3a5f'}
                onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
              />
              <small style={{ 
                color: '#6c757d', 
                fontSize: '0.825rem',
                display: 'block',
                marginTop: '0.5rem'
              }}>
                🔒 Your IC will be hashed and stored securely. During verification, we'll validate that your IC photo matches this number.
              </small>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem', 
                fontWeight: '600',
                color: '#1e3a5f',
                fontSize: '0.95rem'
              }}>
                Email Address
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                required
                placeholder="your.email@example.com"
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  border: '1.5px solid #e0e0e0',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  transition: 'border-color 0.2s',
                  outline: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = '#1e3a5f'}
                onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem', 
                fontWeight: '600',
                color: '#1e3a5f',
                fontSize: '0.95rem'
              }}>
                Political Party
              </label>
              <input
                type="text"
                name="party"
                value={formData.party}
                onChange={handleInputChange}
                required
                placeholder="Your political party or affiliation"
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  border: '1.5px solid #e0e0e0',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  transition: 'border-color 0.2s',
                  outline: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = '#1e3a5f'}
                onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem', 
                fontWeight: '600',
                color: '#1e3a5f',
                fontSize: '0.95rem'
              }}>
                Campaign Manifesto
              </label>
              <textarea
                name="manifesto"
                value={formData.manifesto}
                onChange={handleInputChange}
                required
                rows="5"
                placeholder="Describe your vision, goals, and what you stand for..."
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  border: '1.5px solid #e0e0e0',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  lineHeight: '1.6',
                  transition: 'border-color 0.2s',
                  outline: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = '#1e3a5f'}
                onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem', 
                fontWeight: '600',
                color: '#1e3a5f',
                fontSize: '0.95rem'
              }}>
                Wallet Address
              </label>
              <input
                type="text"
                value={walletAddress}
                disabled
                style={{
                  width: '100%',
                  padding: '0.875rem',
                  border: '1.5px solid #e0e0e0',
                  borderRadius: '0.5rem',
                  fontSize: '0.9rem',
                  backgroundColor: '#f5f7fa',
                  color: '#6c757d',
                  fontFamily: 'monospace'
                }}
              />
            </div>

            <button 
              type="submit"
              disabled={loading || !walletAddress}
              style={{
                width: '100%',
                padding: '1rem',
                backgroundColor: loading || !walletAddress ? '#9ca3af' : '#1e3a5f',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '1.05rem',
                cursor: (loading || !walletAddress) ? 'not-allowed' : 'pointer',
                fontWeight: '600',
                transition: 'all 0.2s',
                boxShadow: loading || !walletAddress ? 'none' : '0 2px 8px rgba(30,58,95,0.2)'
              }}
              onMouseEnter={(e) => {
                if (!loading && walletAddress) {
                  e.target.style.backgroundColor = '#2c5282';
                  e.target.style.transform = 'translateY(-1px)';
                  e.target.style.boxShadow = '0 4px 12px rgba(30,58,95,0.3)';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading && walletAddress) {
                  e.target.style.backgroundColor = '#1e3a5f';
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 2px 8px rgba(30,58,95,0.2)';
                }
              }}
            >
              {loading ? 'Registering...' : !walletAddress ? 'Connect Wallet First' : 'Submit Candidate Registration'}
            </button>

            <div style={{
              marginTop: '1.5rem',
              padding: '1rem',
              backgroundColor: '#e8f4f8',
              borderRadius: '0.5rem',
              border: '1px solid #2c5282',
              fontSize: '0.875rem',
              color: '#495057',
              lineHeight: '1.6'
            }}>
              ℹ️ After registration, you'll need to complete identity verification to become an eligible candidate.
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
