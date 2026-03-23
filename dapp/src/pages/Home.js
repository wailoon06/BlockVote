import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDeployedContract, verifyContractExists } from '../utils/contractUtils';
import MessageAlert from '../components/MessageAlert';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import RoleSelectionModal from '../components/RoleSelectionModal';

export default function Home() {
  const [walletAddress, setWalletAddress] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [isRegisteredAsAny, setIsRegisteredAsAny] = useState(false);
  const [userStatus, setUserStatus] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window.ethereum !== 'undefined') {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('disconnect', handleDisconnect);
    }

    return () => {
      if (typeof window.ethereum !== 'undefined') {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('disconnect', handleDisconnect);
      }
    };
  }, []);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage('');
        setMessageType('');
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [message]);

  const handleAccountsChanged = (accounts) => {
    if (accounts.length === 0) {
      setWalletAddress('');
      setIsConnected(false);
      setIsRegisteredAsAny(false);
    } else if (accounts[0] !== walletAddress) {
      setWalletAddress(accounts[0]);
      setIsConnected(true);
      checkRegistrationStatus(accounts[0]);
    }
  };

  const handleDisconnect = () => {
    setWalletAddress('');
    setIsConnected(false);
    setIsRegisteredAsAny(false);
  };

  const checkRegistrationStatus = async (address) => {
    try {
      const { deployedContract } = await getDeployedContract();

      // Check if admin first
      const adminStatus = await deployedContract.methods.isAdmin(address).call();
      if (adminStatus) {
        navigate('/admin');
        return;
      }

      // Check if registered trustee
      const trusteeInfo = await deployedContract.methods.getTrusteeInfo(address).call();
      if (trusteeInfo.walletAddress.toLowerCase() === address.toLowerCase()) {
        navigate('/trustee-dashboard');
        return;
      }

      // Check if registered as voter or candidate
      const isVoter = await deployedContract.methods.isVoterRegistered(address).call();
      const isCandidate = await deployedContract.methods.isCandidateRegistered(address).call();
      
      // Check if registered as organizer
      const isOrganizer = await deployedContract.methods.isOrganizerRegistered(address).call();

      // Check if organizer is approved - redirect to dashboard
      if (isOrganizer) {
        const isApprovedOrganizer = await deployedContract.methods.isOrganizer(address).call();
        if (isApprovedOrganizer) {
          navigate('/organizer-dashboard');
          return;
        }
      }

      // Set flag if registered as any entity
      if (isVoter || isCandidate || isOrganizer) {
        setIsRegisteredAsAny(true);
        
        // Get detailed status
        if (isOrganizer) {
          const organizerInfo = await deployedContract.methods.getOrganizerInfo(address).call();
          const status = {
            role: 'Organizer',
            status: organizerInfo.status,
            organizationName: organizerInfo.organizationName,
            email: organizerInfo.email,
            registeredAt: organizerInfo.registeredAt
          };
          setUserStatus(status);
        } else if (isCandidate) {
          const candidateInfo = await deployedContract.methods.getCandidateInfo(address).call();
          
          // If candidate is verified, redirect to dashboard
          if (candidateInfo.status === 'VERIFIED') {
            navigate('/candidate-dashboard');
            return;
          }
          
          const status = {
            role: 'Candidate',
            status: candidateInfo.status,
            name: candidateInfo.name,
            email: candidateInfo.email,
            party: candidateInfo.party,
            registeredAt: candidateInfo.registeredAt,
            verifiedAt: candidateInfo.verifiedAt
          };
          setUserStatus(status);
        } else if (isVoter) {
          const voterInfo = await deployedContract.methods.getVoterInfo(address).call();
          
          // If voter is verified, redirect to dashboard
          if (voterInfo.status === 'VERIFIED') {
            navigate('/voter-dashboard');
            return;
          }
          
          const status = {
            role: 'Voter',
            status: voterInfo.status,
            name: voterInfo.name,
            email: voterInfo.email,
            registeredAt: voterInfo.registeredAt,
            verifiedAt: voterInfo.verifiedAt
          };
          setUserStatus(status);
        }
      } else {
        setIsRegisteredAsAny(false);
        setUserStatus(null);
      }
    } catch (error) {
      console.error('Error checking registration status:', error);
    }
  };

  const handleRoleSelection = (role) => {
    setShowRoleModal(false);
    if (role === 'voter') {
      navigate('/register', { state: { walletAddress } });
    } else if (role === 'candidate') {
      navigate('/candidate-register', { state: { walletAddress } });
    } else if (role === 'organizer') {
      navigate('/organizer-register', { state: { walletAddress } });
    }
  };

  const handleOrganizerRegisterClick = async () => {
    if (!isConnected) {
      try {
        if (typeof window.ethereum !== 'undefined') {
          const currentAccounts = await window.ethereum.request({ 
            method: 'eth_accounts' 
          });

          if (currentAccounts.length > 0) {
            try {
              await window.ethereum.request({
                method: 'wallet_requestPermissions',
                params: [{
                  eth_accounts: {}
                }]
              });
            } catch (permError) {
              if (permError.code === 4001) {
                setMessage('Connection cancelled. Please try again.');
                setMessageType('danger');
                return;
              }
            }
          }

          const accounts = await window.ethereum.request({ 
            method: 'eth_requestAccounts' 
          });
          
          if (accounts.length > 0) {
            setWalletAddress(accounts[0]);
            setIsConnected(true);
            setMessage('Wallet connected successfully! Redirecting to dashboard...');
            setMessageType('success');
            
            navigate('/organizer-register', { state: { walletAddress: accounts[0] } });
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
    } else {
      navigate('/organizer-register', { state: { walletAddress } });
    }
  };

  const connectWallet = async () => {
    try {
      if (typeof window.ethereum !== 'undefined') {
        const currentAccounts = await window.ethereum.request({ 
          method: 'eth_accounts' 
        });

        if (currentAccounts.length > 0) {
          try {
            await window.ethereum.request({
              method: 'wallet_requestPermissions',
              params: [{
                eth_accounts: {}
              }]
            });
          } catch (permError) {
            if (permError.code === 4001) {
              setMessage('Connection cancelled. Please try again.');
              setMessageType('danger');
              return;
            } else {
              console.log('Permission request failed:', permError);
            }
          }
        }

        const accounts = await window.ethereum.request({ 
          method: 'eth_requestAccounts' 
        });
        
        if (accounts.length > 0) {
          setWalletAddress(accounts[0]);
          setIsConnected(true);
          setMessage('Wallet connected successfully! Redirecting to dashboard...');
          setMessageType('success');
          
          await checkRegistrationStatus(accounts[0]);
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
    setWalletAddress('');
    setIsConnected(false);
    setIsRegisteredAsAny(false);
    setUserStatus(null);
    setMessage('Wallet disconnected successfully!');
    setMessageType('success');
    
    setTimeout(() => {
      setMessage('');
    }, 3000);
  };

  // Landing Page for Guests
  if (!isConnected) {
    return (
      <>
        <RoleSelectionModal 
          isOpen={showRoleModal} 
          onSelectRole={handleRoleSelection}
          onClose={() => setShowRoleModal(false)}
        />
        <Navbar title="BlockVote" onConnect={connectWallet} isConnected={isConnected} />
        
        {/* Only show landing page content when modal is not open */}
        {!showRoleModal && (
          <div style={{ 
            minHeight: '100vh',
            paddingTop: '70px'
          }}>
            {message && <MessageAlert message={message} type={messageType} />}
            
            {/* Hero Section */}
            <section style={{
              padding: '5rem 2rem',
              textAlign: 'center',
              background: 'linear-gradient(135deg, #fafbfc 0%, #f0f9ff 50%, #e0f2fe 100%)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* Decorative Elements */}
              <div style={{
                position: 'absolute',
                top: '-10%',
                right: '-5%',
                width: '400px',
                height: '400px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(6, 182, 212, 0.1) 0%, transparent 70%)',
                pointerEvents: 'none'
              }}></div>
              <div style={{
                position: 'absolute',
                bottom: '-10%',
                left: '-5%',
                width: '350px',
                height: '350px',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%)',
                pointerEvents: 'none'
              }}></div>

              <div style={{ maxWidth: '900px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🗳️</div>
                <h1 style={{
                  fontSize: '3.5rem',
                  fontWeight: '700',
                  marginBottom: '1.5rem',
                  background: 'linear-gradient(135deg, #0891b2 0%, #3b82f6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  lineHeight: '1.2'
                }}>
                  Secure Digital Voting<br/>on Blockchain
                </h1>
                <p style={{
                  fontSize: '1.35rem',
                  color: '#64748b',
                  marginBottom: '3rem',
                  lineHeight: '1.8',
                  fontWeight: '400'
                }}>
                  Experience transparent, tamper-proof elections powered by<br/>
                  blockchain technology and smart contracts
                </p>
              </div>
            </section>

            {/* Features Section */}
            <section style={{
              padding: '5rem 2rem',
              backgroundColor: '#ffffff'
            }}>
              <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                <h2 style={{
                  textAlign: 'center',
                  fontSize: '2.5rem',
                  fontWeight: '700',
                  marginBottom: '1rem',
                  color: '#1e293b'
                }}>
                  Why Choose BlockVote?
                </h2>
                <p style={{
                  textAlign: 'center',
                  fontSize: '1.125rem',
                  color: '#64748b',
                  marginBottom: '4rem',
                  maxWidth: '700px',
                  margin: '0 auto 4rem'
                }}>
                  Built with cutting-edge blockchain technology to ensure integrity and transparency
                </p>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: '2rem'
                }}>
                  {[
                    {
                      icon: '🔒',
                      title: 'Secure & Immutable',
                      description: 'Every vote is encrypted and recorded on the blockchain, making it impossible to alter or tamper with results.',
                      color: '#06b6d4'
                    },
                    {
                      icon: '👁️',
                      title: 'Transparent Process',
                      description: 'Full transparency with real-time vote tracking while maintaining voter anonymity and privacy.',
                      color: '#3b82f6'
                    },
                    {
                      icon: '⚡',
                      title: 'Instant Results',
                      description: 'Automated vote counting with instant result publication once the voting period ends.',
                      color: '#8b5cf6'
                    },
                    {
                      icon: '✓',
                      title: 'Identity Verification',
                      description: 'Robust KYC verification system ensures only eligible voters can participate in elections.',
                      color: '#10b981'
                    },
                    {
                      icon: '🌐',
                    title: 'Decentralized',
                    description: 'No central authority controls the voting process, ensuring true democratic participation.',
                    color: '#f59e0b'
                  },
                  {
                    icon: '📱',
                    title: 'Easy to Use',
                    description: 'Simple and intuitive interface makes voting accessible to everyone, anywhere, anytime.',
                    color: '#ec4899'
                  }
                ].map((feature, index) => (
                  <div
                    key={index}
                    style={{
                      backgroundColor: '#ffffff',
                      padding: '2.5rem',
                      borderRadius: '20px',
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.04)',
                      transition: 'all 0.3s ease',
                      cursor: 'default'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-8px)';
                      e.currentTarget.style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.1)';
                      e.currentTarget.style.borderColor = feature.color;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.04)';
                      e.currentTarget.style.borderColor = '#e2e8f0';
                    }}
                  >
                    <div style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '16px',
                      background: `linear-gradient(135deg, ${feature.color}20 0%, ${feature.color}10 100%)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '2rem',
                      marginBottom: '1.5rem'
                    }}>
                      {feature.icon}
                    </div>
                    <h3 style={{
                      fontSize: '1.375rem',
                      fontWeight: '600',
                      marginBottom: '1rem',
                      color: '#1e293b'
                    }}>
                      {feature.title}
                    </h3>
                    <p style={{
                      fontSize: '1rem',
                      color: '#64748b',
                      lineHeight: '1.7'
                    }}>
                      {feature.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section style={{
            padding: '5rem 2rem',
            background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
            textAlign: 'center'
          }}>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              <h2 style={{
                fontSize: '2.5rem',
                fontWeight: '700',
                color: 'white',
                marginBottom: '1.5rem'
              }}>
                Ready to Get Started?
              </h2>
              <p style={{
                fontSize: '1.25rem',
                color: 'rgba(255, 255, 255, 0.9)',
                marginBottom: '2.5rem',
                lineHeight: '1.7'
              }}>
                Connect your wallet to register as a voter, candidate, or election organizer
              </p>
              <button
                onClick={connectWallet}
                style={{
                  padding: '1rem 3rem',
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  background: 'white',
                  color: '#0891b2',
                  border: 'none',
                  borderRadius: '16px',
                  cursor: 'pointer',
                  boxShadow: '0 8px 20px rgba(0, 0, 0, 0.15)',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-3px) scale(1.05)';
                  e.target.style.boxShadow = '0 12px 28px rgba(0, 0, 0, 0.2)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0) scale(1)';
                  e.target.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.15)';
                }}
              >
                Connect Your Wallet Now
              </button>
            </div>
          </section>

          {/* Footer */}
          <footer style={{
            padding: '3rem 2rem',
            backgroundColor: '#1e293b',
            color: 'white',
            textAlign: 'center'
          }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1rem' }}>
                🗳️ BlockVote
              </div>
              <p style={{ color: '#94a3b8', fontSize: '0.95rem' }}>
                © 2026 BlockVote. Secure, Transparent, Democratic.
              </p>
            </div>
          </footer>
          </div>
        )}
      </>
    );
  }

  // Dashboard for Logged In Users
  return (
    <>
      <Navbar 
        title="BlockVote" 
        walletAddress={walletAddress}
        onLogout={logout}
        userRole={isRegisteredAsAny ? userStatus?.role : null}
        isConnected={isConnected}
      />
      {isRegisteredAsAny && <Sidebar userRole={userStatus?.role} />}
      
      <div style={{ 
        marginLeft: isRegisteredAsAny ? '70px' : '0',
        marginTop: '70px',
        minHeight: 'calc(100vh - 70px)',
        padding: '2.5rem',
        backgroundColor: '#fafbfc'
      }}>
        {message && <MessageAlert message={message} type={messageType} />}
        
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {/* Show registration options for new users */}
          {!isRegisteredAsAny ? (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              minHeight: 'calc(100vh - 200px)' 
            }}>
              <div style={{ maxWidth: '900px', width: '100%' }}>
                <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🗳️</div>
                  <h1 style={{
                    fontSize: '2.5rem',
                    fontWeight: '700',
                    marginBottom: '1rem',
                    color: '#1e293b'
                  }}>
                    Welcome to BlockVote!
                  </h1>
                  <p style={{
                    fontSize: '1.125rem',
                    color: '#64748b',
                    lineHeight: '1.6'
                  }}>
                    Choose your role to get started with secure blockchain voting
                  </p>
                </div>

                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
                  gap: '1.5rem' 
                }}>
                  {/* Voter Card */}
                  <div
                    onClick={() => navigate('/register', { state: { walletAddress } })}
                    style={{
                      backgroundColor: 'white',
                      padding: '2.5rem',
                      borderRadius: '16px',
                      border: '2px solid #e2e8f0',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      textAlign: 'center'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-8px)';
                      e.currentTarget.style.borderColor = '#06b6d4';
                      e.currentTarget.style.boxShadow = '0 12px 24px rgba(6, 182, 212, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ 
                      fontSize: '3.5rem', 
                      marginBottom: '1.5rem',
                      background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text'
                    }}>
                      🗳️
                    </div>
                    <h3 style={{
                      fontSize: '1.5rem',
                      fontWeight: '600',
                      color: '#1e293b',
                      marginBottom: '0.75rem'
                    }}>
                      Register as Voter
                    </h3>
                    <p style={{
                      color: '#64748b',
                      fontSize: '0.95rem',
                      lineHeight: '1.6',
                      marginBottom: '1.5rem'
                    }}>
                      Participate in elections by casting your vote securely on the blockchain
                    </p>
                    <div style={{
                      padding: '0.75rem 1.5rem',
                      background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                      color: 'white',
                      borderRadius: '8px',
                      fontWeight: '600',
                      fontSize: '0.95rem',
                      display: 'inline-block'
                    }}>
                      Get Started →
                    </div>
                  </div>

                  {/* Candidate Card */}
                  <div
                    onClick={() => navigate('/candidate-register', { state: { walletAddress } })}
                    style={{
                      backgroundColor: 'white',
                      padding: '2.5rem',
                      borderRadius: '16px',
                      border: '2px solid #e2e8f0',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      textAlign: 'center'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-8px)';
                      e.currentTarget.style.borderColor = '#8b5cf6';
                      e.currentTarget.style.boxShadow = '0 12px 24px rgba(139, 92, 246, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ 
                      fontSize: '3.5rem', 
                      marginBottom: '1.5rem',
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text'
                    }}>
                      👔
                    </div>
                    <h3 style={{
                      fontSize: '1.5rem',
                      fontWeight: '600',
                      color: '#1e293b',
                      marginBottom: '0.75rem'
                    }}>
                      Register as Candidate
                    </h3>
                    <p style={{
                      color: '#64748b',
                      fontSize: '0.95rem',
                      lineHeight: '1.6',
                      marginBottom: '1.5rem'
                    }}>
                      Run for office and represent your community in elections
                    </p>
                    <div style={{
                      padding: '0.75rem 1.5rem',
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
                      color: 'white',
                      borderRadius: '8px',
                      fontWeight: '600',
                      fontSize: '0.95rem',
                      display: 'inline-block'
                    }}>
                      Get Started →
                    </div>
                  </div>

                  {/* Organizer Card */}
                  <div
                    onClick={() => navigate('/organizer-register', { state: { walletAddress } })}
                    style={{
                      backgroundColor: 'white',
                      padding: '2.5rem',
                      borderRadius: '16px',
                      border: '2px solid #e2e8f0',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      textAlign: 'center'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-8px)';
                      e.currentTarget.style.borderColor = '#10b981';
                      e.currentTarget.style.boxShadow = '0 12px 24px rgba(16, 185, 129, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.borderColor = '#e2e8f0';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ 
                      fontSize: '3.5rem', 
                      marginBottom: '1.5rem',
                      background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text'
                    }}>
                      🏢
                    </div>
                    <h3 style={{
                      fontSize: '1.5rem',
                      fontWeight: '600',
                      color: '#1e293b',
                      marginBottom: '0.75rem'
                    }}>
                      Register as Organizer
                    </h3>
                    <p style={{
                      color: '#64748b',
                      fontSize: '0.95rem',
                      lineHeight: '1.6',
                      marginBottom: '1.5rem'
                    }}>
                      Create and manage elections for your organization
                    </p>
                    <div style={{
                      padding: '0.75rem 1.5rem',
                      background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                      color: 'white',
                      borderRadius: '8px',
                      fontWeight: '600',
                      fontSize: '0.95rem',
                      display: 'inline-block'
                    }}>
                      Get Started →
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
          {/* Check if user is verified or not */}
          {userStatus && userStatus.status === 'VERIFIED' ? (
            <>
          {/* Welcome Header - For Verified Users */}
          <div style={{ marginBottom: '2.5rem' }}>
            <h1 style={{
              fontSize: '2rem',
              fontWeight: '600',
              color: '#1e293b',
              marginBottom: '0.5rem'
            }}>
              Welcome back! 👋
            </h1>
            <p style={{ color: '#64748b', fontSize: '1rem' }}>
              Here's what's happening with your voting activities
            </p>
          </div>

          {/* Quick Actions - For Verified Users */}
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)',
            marginBottom: '2.5rem'
          }}>
            <h2 style={{
              fontSize: '1.25rem',
              fontWeight: '600',
              color: '#1e293b',
              marginBottom: '1.5rem'
            }}>
              Quick Actions
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem'
            }}>
              {(userStatus?.role === 'Candidate' ? [
                { label: 'Apply to Elections', icon: '📝', path: '/candidate-elections' },
                { label: 'My Elections', icon: '🎯', path: '/candidate-my-elections' }
              ] : userStatus?.role === 'Voter' ? [
                { label: 'Vote in Elections', icon: '🗳️', path: '/voter-elections' }
              ] : [
                { label: 'View Elections', icon: '📊', path: '/elections' }
              ]).map((action, index) => (
                <button
                  key={index}
                  onClick={() => navigate(action.path)}
                  style={{
                    padding: '1.25rem',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    fontSize: '0.95rem',
                    fontWeight: '500',
                    color: '#475569'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#e0f2fe';
                    e.currentTarget.style.borderColor = '#06b6d4';
                    e.currentTarget.style.color = '#0891b2';
                    e.currentTarget.style.transform = 'translateX(4px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#f8fafc';
                    e.currentTarget.style.borderColor = '#e2e8f0';
                    e.currentTarget.style.color = '#475569';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <span style={{ fontSize: '1.5rem' }}>{action.icon}</span>
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* User Status Card */}
          {userStatus && (
            <div style={{
              backgroundColor: 'white',
              padding: '2rem',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.04)'
            }}>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: '600',
                color: '#1e293b',
                marginBottom: '1.5rem'
              }}>
                Your Account Status
              </h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1.5rem'
              }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                    Role
                  </div>
                  <div style={{ color: '#1e293b', fontWeight: '600', textTransform: 'capitalize' }}>
                    {userStatus?.role}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                    Status
                  </div>
                  <div>
                    <span style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      backgroundColor: userStatus.status === 'VERIFIED' ? '#d1fae5' : '#fef3c7',
                      color: userStatus.status === 'VERIFIED' ? '#065f46' : '#92400e'
                    }}>
                      {userStatus.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
          </>
          ) : (
            <>
          {/* Content for Registered but Not Verified Users */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            minHeight: 'calc(100vh - 200px)' 
          }}>
            <div style={{ maxWidth: '700px', width: '100%' }}>
              {/* User Status Card */}
              {userStatus && (
                <div style={{
                  backgroundColor: 'white',
                  padding: '3rem',
                  borderRadius: '16px',
                  border: '2px solid #e2e8f0',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>
                    {userStatus.role === 'Organizer' ? '🏢' : '⏳'}
                  </div>
                  <h2 style={{
                    fontSize: '2rem',
                    fontWeight: '600',
                    color: '#1e293b',
                    marginBottom: '1rem'
                  }}>
                    {userStatus.role === 'Organizer' ? 'Account Pending Approval' : 'Account Pending Verification'}
                  </h2>
                  <p style={{
                    color: '#64748b',
                    fontSize: '1.125rem',
                    marginBottom: '2.5rem',
                    lineHeight: '1.6'
                  }}>
                    {userStatus.role === 'Organizer' 
                      ? 'Your organizer account has been registered and is awaiting admin approval'
                      : 'Your account has been registered but needs to be verified before you can participate'}
                  </p>
                  
                  <div style={{
                    backgroundColor: '#f8fafc',
                    padding: '2rem',
                    borderRadius: '12px',
                    marginBottom: userStatus.role === 'Organizer' ? '0' : '2rem',
                    border: '1px solid #e2e8f0'
                  }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '1.5rem',
                      textAlign: 'left'
                    }}>
                      <div>
                        <div style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                          Role
                        </div>
                        <div style={{ color: '#1e293b', fontWeight: '600', fontSize: '1.125rem', textTransform: 'capitalize' }}>
                          {userStatus?.role}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                          Status
                        </div>
                        <div>
                          <span style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '8px',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            backgroundColor: '#fef3c7',
                            color: '#92400e',
                            display: 'inline-block'
                          }}>
                            {userStatus.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Only show Verify button for non-organizers */}
                  {userStatus.role !== 'Organizer' && (
                    <button
                      onClick={() => navigate('/verify', { state: { walletAddress } })}
                      style={{
                        padding: '1rem 2.5rem',
                        background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        fontSize: '1.125rem',
                        fontWeight: '600',
                        boxShadow: '0 4px 12px rgba(6, 182, 212, 0.3)',
                        transition: 'all 0.2s ease',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        marginTop: '2rem'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(6, 182, 212, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(6, 182, 212, 0.3)';
                      }}
                    >
                      <span style={{ fontSize: '1.5rem' }}>✓</span>
                      Verify Your Account
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          </>
          )}
          </>
          )}
        </div>
      </div>
    </>
  );
}
