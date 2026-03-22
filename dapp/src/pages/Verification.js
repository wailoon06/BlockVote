import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getDeployedContract } from '../utils/contractUtils';
import { verifyICMatch } from '../utils/icHashUtils';
import { generateRegistrationProof } from '../utils/zkpProofGenerator';
import { generateVoterSecret, storeVoterSecret, getVoterSecret } from '../utils/poseidonUtils';
import Navbar from '../components/Navbar';
import MessageAlert from '../components/MessageAlert';

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
      setTimeout(() => navigate('/'), 2000);
    }
  }, [walletAddress]);

  const checkVoterStatus = async () => {
    setCheckingStatus(true);
    try {
      const { deployedContract } = await getDeployedContract();

      const isRegistered = await deployedContract.methods
        .isWalletRegistered(walletAddress)
        .call();

      if (!isRegistered) {
        setMessage('Your wallet is not registered. Please register first.');
        setMessageType('danger');
        setCheckingStatus(false);
        return;
      }

      const info = await deployedContract.methods.getVoterInfo(walletAddress).call();
      
      setVoterInfo({
        name: info.name,
        email: info.email,
        status: info.status,
        registeredAt: new Date(parseInt(info.registeredAt) * 1000),
        verifiedAt: parseInt(info.verifiedAt) > 0 ? new Date(parseInt(info.verifiedAt) * 1000) : null
      });

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
    navigate('/', { replace: true });
  };

  const handleIcPhotoChange = (e) => {
    const file = e.target.files[0];
    const inputName = e.target.name;
    
    if (file) {
      if (!file.type.startsWith('image/')) {
        setMessage('Please upload a valid image file for IC');
        setMessageType('danger');
        return;
      }

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
      if (!file.type.startsWith('image/')) {
        setMessage('Please upload a valid image file for selfie');
        setMessageType('danger');
        return;
      }

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
    setMessage('🔍 Step 1/5: Verifying your identity documents...');
    setMessageType('info');

    try {
      const icFormData = new FormData();
      icFormData.append('front', icFrontPhoto);
      icFormData.append('back', icBackPhoto);
      icFormData.append('selfie_image', selfiePhoto);

      setMessage('Scanning IC...');
      const icResponse = await fetch('http://localhost:5000/verify', {
        method: 'POST',
        body: icFormData
      });

      const result = await icResponse.json();

      if (!icResponse.ok || !result.ic_verified) {
        throw new Error(result.feedback || result.message || result.error || 'IC verification failed. Ensure your photos are clear and readable.');
      }

      // Step 2: Validate OCR IC matches stored IC hash on blockchain
      setMessage('Validating IC...');
      setMessageType('info');

      const { deployedContract } = await getDeployedContract();
      const voterData = await deployedContract.methods.voters(walletAddress).call();
      const storedICHash = voterData.icHash;

      // Compare OCR-extracted IC with stored IC hash
      const ocrIC = result.ic_number;
      if (!ocrIC) {
        throw new Error('IC number not found in verification result. Please try again.');
      }

      const icMatches = verifyICMatch(ocrIC, storedICHash);
      if (!icMatches) {
        throw new Error('IC mismatch. Please use the correct IC card registered with your wallet.');
      }

      setMessage('IC validated. Generating proof...');
      setMessageType('info');

      // Step 3: Retrieve or generate voter secret (persisted in localStorage, encrypted with MetaMask key)
      let voterSecret = await getVoterSecret(walletAddress);
      if (!voterSecret) {
        voterSecret = generateVoterSecret();
        await storeVoterSecret(walletAddress, voterSecret);
        console.log('[ZKP] New voter secret generated and stored locally');
      } else {
        console.log('[ZKP] Using existing voter secret from localStorage');
      }

      // Step 4: Generate registration ZKP proof (VoteWithICAgeCheck, electionId=0)
      setMessage('Generating proof (may take ~30s)...');

      const { proof, publicSignals, pA, pB, pC, pubSignals } =
        await generateRegistrationProof(ocrIC, walletAddress, voterSecret);

      console.log('Registration proof generated:', { proof, publicSignals });

      setMessage('Confirm transaction in MetaMask...');
      setMessageType('info');

      // Step 5: Submit ZKP proof to contract — also stores Poseidon commitment on-chain
      const { deployedContract: contract } = await getDeployedContract();
      await contract.methods
        .verifyVoterWithZKP(pA, pB, pC, pubSignals)
        .send({ from: walletAddress });

      setMessage('✅ Verification complete!');
      setMessageType('success');
      
      setTimeout(() => {
        checkVoterStatus();
      }, 3000);

    } catch (error) {
      console.error('Verification error:', error);
      
      let errorMsg = 'Verification failed. ';
      if (error.message.includes('Failed to fetch')) {
        errorMsg += 'Cannot connect to verification server (localhost:5000). Make sure it is running.';
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      setMessage(errorMsg);
      setMessageType('danger');
      setVerificationAttempts(prev => prev + 1);

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
        <Navbar title="VoteChain - Verification" />

        <div style={{ maxWidth: '600px', margin: '3rem auto', padding: '0 1rem' }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 0.5rem 1rem rgba(0,0,0,0.15)',
            padding: '3rem',
            textAlign: 'center'
          }}>
            <MessageAlert message={message} type={messageType} />
            
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
      <Navbar 
        title="BlockVote - Voter Verification" 
        walletAddress={walletAddress} 
        onLogout={logout} 
      />

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: 'calc(70px + 3rem) 2rem 3rem 2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '2rem' }}>
          {/* Left Column - User Info */}
          <div>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              boxShadow: '0 0.5rem 1rem rgba(0,0,0,0.15)',
              padding: '2rem',
              position: 'sticky',
              top: 'calc(70px + 2rem)'
            }}>
              <h3 style={{ marginBottom: '1.5rem', color: '#1e3a5f' }}>Voter Information</h3>
              <div style={{ display: 'grid', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6c757d', marginBottom: '0.25rem' }}>Name</div>
                  <div style={{ fontWeight: '500' }}>{voterInfo.name}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6c757d', marginBottom: '0.25rem' }}>Email</div>
                  <div style={{ fontWeight: '500' }}>{voterInfo.email}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6c757d', marginBottom: '0.25rem' }}>Status</div>
                  <span style={{
                    display: 'inline-block',
                    padding: '0.25rem 0.75rem',
                    backgroundColor: '#fff3cd',
                    color: '#664d03',
                    borderRadius: '0.25rem',
                    fontSize: '0.875rem',
                    fontWeight: '500'
                  }}>
                    {voterInfo.status}
                  </span>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#6c757d', marginBottom: '0.25rem' }}>Registered</div>
                  <div style={{ fontWeight: '500' }}>{voterInfo.registeredAt.toLocaleDateString()}</div>
                </div>
              </div>

              <div style={{
                marginTop: '2rem',
                padding: '1rem',
                backgroundColor: '#e7f3ff',
                borderRadius: '0.5rem'
              }}>
                <strong style={{ display: 'block', marginBottom: '0.75rem', fontSize: '0.875rem' }}>Guidelines:</strong>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', lineHeight: '1.6' }}>
                  <li>Clear and well-lit photos</li>
                  <li>IC details readable</li>
                  <li>Face clearly visible</li>
                  <li>No filters or edits</li>
                  <li>Straight-on shots</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Right Column - Verification Form */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.5rem',
            boxShadow: '0 0.5rem 1rem rgba(0,0,0,0.15)',
            padding: '2rem'
          }}>
            <h3 style={{ marginBottom: '1.5rem', color: '#1e3a5f' }}>Identity Verification</h3>
          
          <MessageAlert 
            message={message} 
            type={messageType} 
            onClose={() => setMessage('')} 
          />

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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {/* IC Front Photo Upload */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>
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
                    padding: '0.5rem',
                    border: '1px solid #ced4da',
                    borderRadius: '0.25rem',
                    fontSize: '0.875rem'
                  }}
                />
                {icFrontPreview && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <img 
                      src={icFrontPreview} 
                      alt="IC Front" 
                      style={{ 
                        width: '100%', 
                        maxHeight: '200px',
                        objectFit: 'cover',
                        border: '2px solid #dee2e6',
                        borderRadius: '0.25rem'
                      }}
                    />
                  </div>
                )}
              </div>

              {/* IC Back Photo Upload */}
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>
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
                    padding: '0.5rem',
                    border: '1px solid #ced4da',
                    borderRadius: '0.25rem',
                    fontSize: '0.875rem'
                  }}
                />
                {icBackPreview && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <img 
                      src={icBackPreview} 
                      alt="IC Back" 
                      style={{ 
                        width: '100%', 
                        maxHeight: '200px',
                        objectFit: 'cover',
                        border: '2px solid #dee2e6',
                        borderRadius: '0.25rem'
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Selfie Upload */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', fontSize: '0.9rem' }}>
                Selfie Photo *
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleSelfieChange}
                required
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ced4da',
                  borderRadius: '0.25rem',
                  fontSize: '0.875rem'
                }}
              />
              {selfiePreview && (
                <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
                  <img 
                    src={selfiePreview} 
                    alt="Selfie" 
                    style={{ 
                      width: '100%',
                      maxWidth: '400px',
                      maxHeight: '200px',
                      objectFit: 'cover',
                      border: '2px solid #dee2e6',
                      borderRadius: '0.25rem'
                    }}
                  />
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button 
              type="submit"
              disabled={verifying || !icFrontPhoto || !icBackPhoto || !selfiePhoto}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: (verifying || !icFrontPhoto || !icBackPhoto || !selfiePhoto) ? '#6c757d' : '#198754',
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
    </div>
  );
}