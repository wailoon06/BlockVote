import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getDeployedContract } from '../utils/contractUtils';
import MessageAlert from '../components/MessageAlert';
import Navbar from '../components/Navbar';

export default function OrganizerRegister() {
  const navigate = useNavigate();
  const location = useLocation();
  const walletAddress = location.state?.walletAddress || '';

  const [formData, setFormData] = useState({
    organizationName: '',
    email: '',
    description: ''
  });

  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [organizerStatus, setOrganizerStatus] = useState('');

  useEffect(() => {
    if (!walletAddress) {
      navigate('/');
      return;
    }
    
    checkOrganizerStatus();
  }, [walletAddress, navigate]);

  const checkOrganizerStatus = async () => {
    try {
      const { deployedContract } = await getDeployedContract();
      
      const organizers = await deployedContract.methods.getAllOrganizers().call();
      const isAlreadyRegistered = organizers.some(
        addr => addr.toLowerCase() === walletAddress.toLowerCase()
      );

      if (isAlreadyRegistered) {
        const info = await deployedContract.methods.getOrganizerInfo(walletAddress).call();
        setIsRegistered(true);
        setOrganizerStatus(info.status);
        
        if (info.status === 'PENDING') {
          setMessage('Your application is pending approval from the Election Commission.');
          setMessageType('info');
        } else if (info.status === 'APPROVED') {
          setMessage('Your organization has been approved! You can now create elections.');
          setMessageType('success');
        }
      }
    } catch (error) {
      console.error('Error checking organizer status:', error);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setIsSubmitting(true);

    try {
      // Validation
      if (!formData.organizationName.trim()) {
        throw new Error('Organization name is required');
      }
      if (!formData.email.trim()) {
        throw new Error('Email is required');
      }
      if (!formData.description.trim()) {
        throw new Error('Description is required');
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        throw new Error('Please enter a valid email address');
      }

      setMessage('📝 Step 1/2: Submitting application...');
      setMessageType('info');

      const { web3, deployedContract } = await getDeployedContract();

      // Call registerOrganizer function
      const result = await deployedContract.methods
        .registerOrganizer(
          formData.organizationName,
          formData.email,
          formData.description
        )
        .send({ from: walletAddress });

      console.log('Registration result:', result);

      setMessage('✅ Application submitted successfully! Awaiting approval from Election Commission.');
      setMessageType('success');
      setIsRegistered(true);
      setOrganizerStatus('PENDING');

      // Clear form
      setFormData({
        organizationName: '',
        email: '',
        description: ''
      });

    } catch (error) {
      console.error('Registration error:', error);
      
      let errorMessage = 'Registration failed: ';
      if (error.message.includes('Application already submitted')) {
        errorMessage = 'You have already submitted an application.';
      } else if (error.message.includes('user rejected')) {
        errorMessage = 'Transaction was rejected in MetaMask.';
      } else {
        errorMessage += error.message;
      }
      
      setMessage(errorMessage);
      setMessageType('danger');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid #ddd',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontFamily: 'inherit'
  };

  const labelStyle = {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#1e3a5f',
    fontWeight: '600',
    fontSize: '0.95rem'
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa' }}>
      <Navbar walletAddress={walletAddress} onLogout={() => navigate('/')} />
      
      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '3rem 1.5rem', paddingTop: 'calc(70px + 3rem)' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <h1 style={{ 
            fontSize: '2.5rem', 
            fontWeight: '600', 
            marginBottom: '0.75rem',
            color: '#1e3a5f'
          }}>
            Organizer Registration
          </h1>
          <p style={{ color: '#6c757d', fontSize: '1rem' }}>
            Register your organization to create and manage elections
          </p>
        </div>

        <MessageAlert 
          message={message} 
          type={messageType} 
          onClose={() => setMessage('')} 
        />

        {!isRegistered ? (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            padding: '2.5rem',
            border: '1px solid #e8e8e8'
          }}>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={labelStyle}>
                  Organization Name *
                </label>
                <input
                  type="text"
                  name="organizationName"
                  value={formData.organizationName}
                  onChange={handleInputChange}
                  placeholder="Enter organization name"
                  style={inputStyle}
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={labelStyle}>
                  Email Address *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="organization@example.com"
                  style={inputStyle}
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <label style={labelStyle}>
                  Organization Description *
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  placeholder="Describe your organization, purpose, and why you want to create elections..."
                  style={{
                    ...inputStyle,
                    minHeight: '120px',
                    resize: 'vertical'
                  }}
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div style={{
                padding: '1rem',
                backgroundColor: '#fff3cd',
                borderRadius: '0.5rem',
                marginBottom: '1.5rem',
                fontSize: '0.9rem',
                color: '#856404',
                border: '1px solid #ffeaa7'
              }}>
                <strong>⚠️ Note:</strong> Your application will be reviewed by the Election Commission. 
                You will be notified once approved.
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  style={{
                    flex: 1,
                    padding: '0.875rem',
                    backgroundColor: 'white',
                    color: '#6c757d',
                    border: '2px solid #ddd',
                    borderRadius: '0.5rem',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    flex: 2,
                    padding: '0.875rem',
                    backgroundColor: isSubmitting ? '#6c757d' : '#1e3a5f',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                  disabled={isSubmitting}
                  onMouseEnter={(e) => {
                    if (!isSubmitting) e.target.style.backgroundColor = '#2c5282';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSubmitting) e.target.style.backgroundColor = '#1e3a5f';
                  }}
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            padding: '3rem',
            border: '1px solid #e8e8e8',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>
              {organizerStatus === 'PENDING' ? '⏳' : '✅'}
            </div>
            <h2 style={{ 
              color: '#1e3a5f', 
              marginBottom: '1rem',
              fontSize: '1.75rem'
            }}>
              {organizerStatus === 'PENDING' 
                ? 'Application Pending' 
                : 'Organization Approved'}
            </h2>
            <p style={{ color: '#6c757d', marginBottom: '2rem', lineHeight: '1.7' }}>
              {organizerStatus === 'PENDING'
                ? 'Your application is being reviewed by the Election Commission. You will be notified once a decision is made.'
                : 'Congratulations! Your organization has been approved. You can now create and manage elections on the BlockVote platform.'}
            </p>
            <button
              onClick={() => navigate('/')}
              style={{
                padding: '0.875rem 2rem',
                backgroundColor: '#1e3a5f',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = '#2c5282'}
              onMouseLeave={(e) => e.target.style.backgroundColor = '#1e3a5f'}
            >
              Return to Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
