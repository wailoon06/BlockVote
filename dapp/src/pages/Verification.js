import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import VoterRegisterContract from "../Voter_Register.json";

export default function Verify() {
  const location = useLocation();
  const navigate = useNavigate();
  const walletAddress = location.state?.walletAddress || '';

  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [voterInfo, setVoterInfo] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [icFrontPhoto, setIcFrontPhoto] = useState(null);
  const [icBackPhoto, setIcBackPhoto] = useState(null);
  const [selfiePhoto, setSelfiePhoto] = useState(null);
  const [icFrontPreview, setIcFrontPreview] = useState('');
  const [icBackPreview, setIcBackPreview] = useState('');
  const [selfiePreview, setSelfiePreview] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verificationAttempts, setVerificationAttempts] = useState(0);

  useEffect(() => {
    if (walletAddress) {
      checkVoterStatus();
    } else {
      setMessage('Please connect your wallet first');
      setMessageType('danger');
      setCheckingStatus(false);
      // Redirect to home after 2 seconds
      setTimeout(() => navigate('/'), 2000);
    }
  }, [walletAddress]);

  const checkVoterStatus = async () => {
    setCheckingStatus(true);
    try {
      if (typeof window.ethereum === 'undefined') {
        throw new Error('MetaMask not found');
      }

      const Web3 = (await import('web3')).default;
      const web3 = new Web3(window.ethereum);
      
      const deployedNetwork = VoterRegisterContract.networks[5777];
      if (!deployedNetwork) {
        throw new Error('Contract not deployed on this network!');
      }

      const contract = new web3.eth.Contract(
        VoterRegisterContract.abi,
        deployedNetwork.address
      );

      // Check if wallet is registered
      const isRegistered = await contract.methods
        .isWalletRegistered(walletAddress)
        .call();

      if (!isRegistered) {
        setMessage('Your wallet is not registered. Please register first.');
        setMessageType('danger');
        setCheckingStatus(false);
        return;
      }

      // Get voter info
      const info = await contract.methods.getVoterInfo(walletAddress).call();
      
      setVoterInfo({
        name: info.name,
        email: info.email,
        status: info.status,
        registeredAt: new Date(parseInt(info.registeredAt) * 1000)
      });

      // Check if already verified
      if (info.status === 'VERIFIED') {
        setMessage('Your account is already verified!');
        setMessageType('success');
      } else if (info.status !== 'PENDING_VERIFICATION') {
        setMessage('Your account status does not allow verification at this time.');
        setMessageType('danger');
      }

    } catch (error) {
      console.error('Error checking voter status:', error);
      setMessage('Failed to check voter status: ' + error.message);
      setMessageType('danger');
    }
    setCheckingStatus(false);
  };

  const logout = () => {
    // Clear state and redirect to home (without wallet address state)
    navigate('/', { replace: true });
  };

  const handleIcPhotoChange = (e) => {
    const file = e.target.files[0];
    const inputName = e.target.name;
    
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setMessage('Please upload a valid image file for IC');
        setMessageType('danger');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setMessage('IC photo size must be less than 5MB');
        setMessageType('danger');
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        if (inputName === 'icFront') {
          setIcFrontPhoto(file);
          setIcFrontPreview(reader.result);
        } else if (inputName === 'icBack') {
          setIcBackPhoto(file);
          setIcBackPreview(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelfieChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setMessage('Please upload a valid image file for selfie');
        setMessageType('danger');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setMessage('Selfie photo size must be less than 5MB');
        setMessageType('danger');
        return;
      }

      setSelfiePhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelfiePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmitVerification = async (e) => {
    e.preventDefault();
    
    if (!icFrontPhoto || !icBackPhoto || !selfiePhoto) {
      setMessage('Please upload IC front, IC back, and selfie photos');
      setMessageType('danger');
      return;
    }

    setVerifying(true);
    setMessage('Verifying your identity...');
    setMessageType('info');

    try {
      // Step 1: Verify IC number from front and back images
      const icFormData = new FormData();
      icFormData.append('front', icFrontPhoto);
      icFormData.append('back', icBackPhoto);
      icFormData.append('selfie_image', selfiePhoto);

      setMessage('Extracting IC information...');
      const icResponse = await fetch('http://localhost:5000/verify', {
        method: 'POST',
        body: icFormData
      });

      const result = await icResponse.json();

      if (!icResponse.ok || !result.ic_verified) {
        throw new Error(result.feedback || result.message || result.error || 'IC verification failed. Please ensure your IC photos are clear and readable.');
      }

      // Step 3: Update blockchain if both verifications passed
      setMessage('Identity verified! Updating blockchain...');
      setMessageType('info');

      const Web3 = (await import('web3')).default;
      const web3 = new Web3(window.ethereum);
      
      const deployedNetwork = VoterRegisterContract.networks[5777];
      const contract = new web3.eth.Contract(
        VoterRegisterContract.abi,
        deployedNetwork.address
      );

      // Get voter info to get the verification code
      const voterData = await contract.methods.voters(walletAddress).call();
      const verificationCode = voterData.verificationCode;

      await contract.methods
        .verifyVoter(verificationCode)
        .send({ from: walletAddress });

      setMessage('Verification successful! Your account has been verified.');
      setMessageType('success');
      
      // Refresh voter info
      setTimeout(() => {
        checkVoterStatus();
      }, 2000);

    } catch (error) {
      console.error('Verification error:', error);
      
      let errorMsg = 'Verification failed. ';
      if (error.message.includes('Failed to fetch')) {
        errorMsg += 'Cannot connect to verification server. Please ensure the Flask server is running on http://localhost:5000';
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      setMessage(errorMsg);
      setMessageType('danger');
      setVerificationAttempts(prev => prev + 1);

      // Clear photos for retry on face mismatch or IC verification failure
      if (error.message.includes('Face verification failed') || error.message.includes('IC verification failed')) {
        setIcFrontPhoto(null);
        setIcBackPhoto(null);
        setSelfiePhoto(null);
        setIcFrontPreview('');
        setIcBackPreview('');
        setSelfiePreview('');
      }
    }

    setVerifying(false);
  };

  const requestHelp = () => {
    setMessage('Help request sent! Our support team will contact you via email within 24 hours.');
    setMessageType('info');
    
    // In real implementation, this would send a help request to backend
    // fetch('http://localhost:5000/api/request-help', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ walletAddress, email: voterInfo.email })
    // });
  };

  if (checkingStatus) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Checking verification status...</div>
        </div>
      </div>
    );
  }

  if (!walletAddress || !voterInfo || voterInfo.status === 'VERIFIED') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8f9fa' }}>
        <nav style={{ 
          backgroundColor: '#0d6efd', 
          padding: '1rem 0',
          color: 'white'
        }}>
          <div style={{ 
            maxWidth: '1200px', 
            margin: '0 auto', 
            padding: '0 1rem'
          }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
              VoteChain - Verification
            </div>
          </div>
        </nav>

        <div style={{ maxWidth: '600px', margin: '3rem auto', padding: '0 1rem' }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 0.5rem 1rem rgba(0,0,0,0.15)',
            padding: '3rem',
            textAlign: 'center'
          }}>
            {message && (
              <div style={{
                backgroundColor: messageType === 'success' ? '#d1e7dd' : '#f8d7da',
                color: messageType === 'success' ? '#0f5132' : '#842029',
                padding: '1rem',
                borderRadius: '0.25rem',
                marginBottom: '1rem'
              }}>
                {message}
              </div>
            )}
            
            {voterInfo?.status === 'VERIFIED' ? (
              <>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
                <h2>Already Verified</h2>
                <p style={{ color: '#6c757d' }}>Your account is already verified. You can now participate in voting.</p>
              </>
            ) : (
              <>
                <h2>Access Denied</h2>
                <p style={{ color: '#6c757d' }}>Please check your wallet connection and registration status.</p>
              </>
            )}
            
            <button
              onClick={() => navigate('/')}
              style={{
                marginTop: '1rem',
                padding: '0.75rem 1.5rem',
                backgroundColor: '#0d6efd',
                color: 'white',
                border: 'none',
                borderRadius: '0.25rem',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              Go to Home
            </button>
          </div>
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
            BlockVote - Identity Verification
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
      <div style={{ maxWidth: '800px', margin: '3rem auto', padding: '0 1rem' }}>
        {/* Voter Info Card */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 0.5rem 1rem rgba(0,0,0,0.15)',
          padding: '2rem',
          marginBottom: '2rem'
        }}>
          <h3 style={{ marginBottom: '1rem' }}>Voter Information</h3>
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            <div><strong>Name:</strong> {voterInfo.name}</div>
            <div><strong>Email:</strong> {voterInfo.email}</div>
            <div><strong>Status:</strong> 
              <span style={{
                marginLeft: '0.5rem',
                padding: '0.25rem 0.5rem',
                backgroundColor: '#fff3cd',
                color: '#664d03',
                borderRadius: '0.25rem',
                fontSize: '0.875rem'
              }}>
                {voterInfo.status}
              </span>
            </div>
            <div><strong>Registered:</strong> {voterInfo.registeredAt.toLocaleDateString()}</div>
          </div>
        </div>

        {/* Verification Form */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.5rem',
          boxShadow: '0 0.5rem 1rem rgba(0,0,0,0.15)',
          padding: '3rem'
        }}>
          <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>
            Identity Verification
          </h2>
          <p style={{ textAlign: 'center', color: '#6c757d', marginBottom: '2rem' }}>
            Please upload a clear photo of your IC and a selfie for verification
          </p>
          
          {message && (
            <div style={{
              backgroundColor: messageType === 'success' ? '#d1e7dd' : 
                            messageType === 'info' ? '#cff4fc' : '#f8d7da',
              color: messageType === 'success' ? '#0f5132' : 
                     messageType === 'info' ? '#055160' : '#842029',
              padding: '1rem',
              borderRadius: '0.25rem',
              marginBottom: '1.5rem',
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

          {verificationAttempts >= 3 && (
            <div style={{
              backgroundColor: '#fff3cd',
              color: '#664d03',
              padding: '1rem',
              borderRadius: '0.25rem',
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}>
              <p style={{ marginBottom: '0.5rem' }}>
                You've attempted verification {verificationAttempts} times.
              </p>
              <button
                onClick={requestHelp}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#ffc107',
                  color: '#000',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                Request Help from Support
              </button>
            </div>
          )}

          <form onSubmit={handleSubmitVerification}>
            {/* IC Front Photo Upload */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                IC Front Photo *
              </label>
              <input
                type="file"
                name="icFront"
                accept="image/*"
                onChange={handleIcPhotoChange}
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
                Upload a clear photo of your IC front side (max 5MB)
              </small>
              
              {icFrontPreview && (
                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                  <img 
                    src={icFrontPreview} 
                    alt="IC Front Preview" 
                    style={{ 
                      maxWidth: '100%', 
                      maxHeight: '300px',
                      border: '2px solid #dee2e6',
                      borderRadius: '0.25rem'
                    }}
                  />
                </div>
              )}
            </div>

            {/* IC Back Photo Upload */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                IC Back Photo *
              </label>
              <input
                type="file"
                name="icBack"
                accept="image/*"
                onChange={handleIcPhotoChange}
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
                Upload a clear photo of your IC back side (max 5MB)
              </small>
              
              {icBackPreview && (
                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                  <img 
                    src={icBackPreview} 
                    alt="IC Back Preview" 
                    style={{ 
                      maxWidth: '100%', 
                      maxHeight: '300px',
                      border: '2px solid #dee2e6',
                      borderRadius: '0.25rem'
                    }}
                  />
                </div>
              )}
            </div>

            {/* Selfie Upload */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Selfie Photo *
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleSelfieChange}
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
                Upload a clear selfie showing your face (max 5MB)
              </small>
              
              {selfiePreview && (
                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                  <img 
                    src={selfiePreview} 
                    alt="Selfie Preview" 
                    style={{ 
                      maxWidth: '100%', 
                      maxHeight: '300px',
                      border: '2px solid #dee2e6',
                      borderRadius: '0.25rem'
                    }}
                  />
                </div>
              )}
            </div>

            {/* Guidelines */}
            <div style={{
              backgroundColor: '#e7f3ff',
              padding: '1rem',
              borderRadius: '0.25rem',
              marginBottom: '2rem'
            }}>
              <strong style={{ display: 'block', marginBottom: '0.5rem' }}>Guidelines:</strong>
              <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                <li>Ensure photos are clear and well-lit</li>
                <li>IC details must be readable on both front and back</li>
                <li>Face must be clearly visible in selfie</li>
                <li>No filters or edits applied</li>
                <li>Photos should be taken straight-on (not at an angle)</li>
              </ul>
            </div>

            {/* Submit Button */}
            <button 
              type="submit"
              disabled={verifying || !icFrontPhoto || !icBackPhoto || !selfiePhoto}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: (verifying || !icFrontPhoto || !icBackPhoto || !selfiePhoto) ? '#6c757d' : '#0d6efd',
                color: 'white',
                border: 'none',
                borderRadius: '0.25rem',
                fontSize: '1rem',
                cursor: (verifying || !icFrontPhoto || !icBackPhoto || !selfiePhoto) ? 'not-allowed' : 'pointer',
                fontWeight: '500'
              }}
            >
              {verifying ? 'Verifying...' : 'Submit for Verification'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}