import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getDeployedContract } from '../utils/contractUtils';
import MessageAlert from '../components/MessageAlert';
import Navbar from '../components/Navbar';

export default function CandidateMyElections() {
  const navigate = useNavigate();
  const location = useLocation();
  const [walletAddress, setWalletAddress] = useState(location.state?.walletAddress || '');
  const [candidateInfo, setCandidateInfo] = useState(null);
  const [appliedElections, setAppliedElections] = useState([]);
  const [approvedElections, setApprovedElections] = useState([]);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('applied'); // 'applied' or 'approved'

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage('');
        setMessageType('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const initialize = async () => {
    try {
      let address = walletAddress;
      
      if (!address && typeof window.ethereum !== 'undefined') {
        // First, try to get already connected accounts without prompting
        let accounts = await window.ethereum.request({
          method: 'eth_accounts',
        });

        // If no accounts found, then request connection
        if (accounts.length === 0) {
          accounts = await window.ethereum.request({
            method: 'eth_requestAccounts',
          });
        }

        if (accounts.length > 0) {
          address = accounts[0];
          setWalletAddress(address);

          const { deployedContract } = await getDeployedContract();

          // Check if user is a verified candidate
          const isCandidate = await deployedContract.methods.isCandidateRegistered(address).call();
          
          if (!isCandidate) {
            setMessage('You need to register as a candidate first');
            setMessageType('danger');
            setTimeout(() => navigate('/candidate-register'), 2000);
            return;
          }

          const info = await deployedContract.methods.getCandidateInfo(address).call();
          
          if (info.status !== 'VERIFIED') {
            setMessage('Your candidate profile needs to be verified first');
            setMessageType('danger');
            setTimeout(() => navigate('/candidate-verify'), 2000);
            return;
          }

          setCandidateInfo(info);
          await loadMyElections(deployedContract, address);
        }
      } else if (address) {
        // Address from state, proceed with contract
        const { deployedContract } = await getDeployedContract();
        const isCandidate = await deployedContract.methods.isCandidateRegistered(address).call();
        
        if (!isCandidate) {
          setMessage('You need to register as a candidate first');
          setMessageType('danger');
          setTimeout(() => navigate('/candidate-register'), 2000);
          return;
        }

        const info = await deployedContract.methods.getCandidateInfo(address).call();
        
        if (info.status !== 'VERIFIED') {
          setMessage('Your candidate profile needs to be verified first');
          setMessageType('danger');
          setTimeout(() => navigate('/candidate-verify'), 2000);
          return;
        }

        setCandidateInfo(info);
        await loadMyElections(deployedContract, address);
      } else {
        setMessage('Please install MetaMask!');
        setMessageType('danger');
      }
    } catch (error) {
      console.error('Error initializing:', error);
      setMessage('Failed to initialize: ' + error.message);
      setMessageType('danger');
    } finally {
      setLoading(false);
    }
  };

  const loadMyElections = async (contract, address) => {
    try {
      const totalElections = await contract.methods.getTotalElections().call();
      const applied = [];
      const approved = [];

      for (let i = 1; i <= totalElections; i++) {
        const applicationStatus = await contract.methods.candidateApplicationStatus(i, address).call();
        
        // Only load elections where candidate has applied (status 1, 2, or 3)
        if (Number(applicationStatus) > 0) {
          const info = await contract.methods.getElectionInfo(i).call();
          
          const electionData = {
            id: i,
            title: info.title,
            description: info.description,
            nominationStartTime: Number(info.nominationStartTime),
            nominationEndTime: Number(info.nominationEndTime),
            startTime: Number(info.startTime),
            endTime: Number(info.endTime),
            organizer: info.organizer,
            applicationStatus: Number(applicationStatus),
            createdAt: Number(info.createdAt)
          };

          // Separate into applied (pending/rejected) and approved
          if (Number(applicationStatus) === 2) {
            approved.push(electionData);
          } else {
            applied.push(electionData);
          }
        }
      }

      // Sort by application date (most recent first)
      applied.sort((a, b) => b.createdAt - a.createdAt);
      approved.sort((a, b) => b.createdAt - a.createdAt);
      
      setAppliedElections(applied);
      setApprovedElections(approved);
    } catch (error) {
      console.error('Error loading elections:', error);
      setMessage('Failed to load elections: ' + error.message);
      setMessageType('danger');
    }
  };

  const getApplicationStatusText = (status) => {
    switch (status) {
      case 1: return 'Pending Review';
      case 2: return 'Approved';
      case 3: return 'Rejected';
      default: return 'Unknown';
    }
  };

  const getApplicationStatusStyle = (status) => {
    const baseStyle = {
      padding: '0.5rem 1rem',
      borderRadius: '8px',
      fontSize: '0.875rem',
      fontWeight: '600',
      display: 'inline-block',
      border: '1px solid'
    };

    switch (status) {
      case 1: return { ...baseStyle, backgroundColor: '#fef3c7', color: '#92400e', borderColor: '#fde68a' };
      case 2: return { ...baseStyle, backgroundColor: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' };
      case 3: return { ...baseStyle, backgroundColor: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' };
      default: return baseStyle;
    }
  };

  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getVotingStatus = (election) => {
    const now = Math.floor(Date.now() / 1000);
    if (now < election.startTime) {
      return 'Upcoming';
    } else if (now >= election.startTime && now <= election.endTime) {
      return 'Active';
    } else {
      return 'Ended';
    }
  };

  const handleLogout = () => {
    setWalletAddress('');
    setCandidateInfo(null);
    navigate('/');
  };

  const renderElectionCard = (election) => {
    const votingStatus = getVotingStatus(election);
    
    return (
      <div
        key={election.id}
        style={{
          background: 'white',
          borderRadius: '16px',
          padding: '2rem',
          border: '1px solid #e2e8f0',
          borderLeft: election.applicationStatus === 2 ? '4px solid #10b981' : 
                     election.applicationStatus === 1 ? '4px solid #f59e0b' : 
                     '4px solid #ef4444',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                <h3 style={{ 
                  fontSize: '1.375rem', 
                  margin: 0,
                  color: '#1e293b',
                  fontWeight: '600'
                }}>
                  {election.title}
                </h3>
                <span style={{ 
                  fontSize: '0.7rem',
                  padding: '0.25rem 0.75rem',
                  background: '#e2e8f0',
                  color: '#475569',
                  borderRadius: '9999px',
                  fontWeight: '500'
                }}>#{election.id}</span>
              </div>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>{election.description}</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={getApplicationStatusStyle(election.applicationStatus)}>
                {getApplicationStatusText(election.applicationStatus)}
              </span>
              <span style={{
                padding: '0.375rem 0.875rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                borderRadius: '8px',
                background: votingStatus === 'Active' ? '#dcfce7' : 
                          votingStatus === 'Upcoming' ? '#fef3c7' : '#dbeafe',
                color: votingStatus === 'Active' ? '#166534' : 
                      votingStatus === 'Upcoming' ? '#92400e' : '#1e40af',
                border: votingStatus === 'Active' ? '1px solid #bbf7d0' : 
                       votingStatus === 'Upcoming' ? '1px solid #fde68a' : '1px solid #bfdbfe'
              }}>
                {votingStatus === 'Active' ? '🔴 Live' : votingStatus === 'Upcoming' ? '⏰ Upcoming' : '✓ Ended'}
              </span>
            </div>
          </div>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1rem'
        }}>
          <div style={{ 
            padding: '1rem', 
            background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
            borderRadius: '12px',
            border: '1px solid #bbf7d0'
          }}>
            <div style={{ 
              fontSize: '0.875rem',
              fontWeight: '600',
              color: '#166534',
              marginBottom: '0.5rem'
            }}>Voting Period</div>
            <div style={{ fontSize: '0.875rem', color: '#475569', marginTop: '0.25rem' }}>
              {formatDateTime(election.startTime)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.25rem 0' }}>to</div>
            <div style={{ fontSize: '0.875rem', color: '#475569' }}>
              {formatDateTime(election.endTime)}
            </div>
          </div>
        </div>

        {election.applicationStatus === 2 && votingStatus === 'Active' && (
          <div style={{
            marginTop: '1rem',
            padding: '1rem 1.25rem',
            background: '#dcfce7',
            border: '1px solid #bbf7d0',
            borderRadius: '12px',
            color: '#166534',
            fontSize: '0.95rem',
            fontWeight: '500'
          }}>
            <strong>✓ You are participating!</strong> Your candidacy is approved and voting is now active.
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', animation: 'pulse 2s infinite' }}>⏳</div>
          <div style={{ fontSize: '1.25rem', color: '#64748b', fontWeight: '500' }}>Loading your elections...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #f8fafc 0%, #e2e8f0 100%)' }}>
      <Navbar 
        title="BlockVote - My Elections"
        walletAddress={walletAddress}
        onLogout={handleLogout}
        userRole="candidate"
      />

      <div style={{ 
        maxWidth: '1400px', 
        margin: '0 auto', 
        padding: '2.5rem 2rem',
        paddingTop: 'calc(70px + 2.5rem)'
      }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '2rem' }}>📋</span>
            <h1 style={{ 
              fontSize: '2rem', 
              margin: 0,
              color: '#1e293b',
              fontWeight: '700'
            }}>
              My Election Applications
            </h1>
          </div>
          <p style={{ 
            fontSize: '1.05rem',
            color: '#64748b',
            margin: 0
          }}>
            Track your election applications and participation status
          </p>
        </div>

        <MessageAlert message={message} type={messageType} onClose={() => setMessage('')} />

        {candidateInfo && (
          <div style={{ 
            marginBottom: '2rem', 
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
            color: 'white', 
            borderRadius: '16px',
            padding: '2rem',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
            border: 'none'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '2rem' }}>🎯</span>
                  <h3 style={{ color: 'white', margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>Your Candidate Profile</h3>
                </div>
                <div style={{ 
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                  gap: '1.5rem' 
                }}>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>Name</div>
                    <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{candidateInfo.name}</div>
                  </div>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>Party</div>
                    <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{candidateInfo.party}</div>
                  </div>
                </div>
              </div>
              <span style={{ 
                backgroundColor: '#dcfce7', 
                color: '#166534', 
                fontSize: '0.875rem', 
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                fontWeight: '600',
                border: '1px solid #bbf7d0'
              }}>
                ✓ {candidateInfo.status}
              </span>
            </div>
          </div>
        )}

        {/* Modern Tabs */}
        <div style={{ 
          padding: '0', 
          marginBottom: '2rem', 
          overflow: 'hidden',
          background: 'white',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            display: 'flex',
            gap: '0',
            borderBottom: '2px solid #e2e8f0'
          }}>
            <button
              onClick={() => setActiveTab('applied')}
              style={{
                flex: 1,
                padding: '1.25rem 2rem',
                backgroundColor: activeTab === 'applied' ? '#2563EB' : 'transparent',
                border: 'none',
                borderRadius: 0,
                color: activeTab === 'applied' ? 'white' : '#64748b',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
              onMouseEnter={(e) => {
                if (activeTab !== 'applied') {
                  e.currentTarget.style.backgroundColor = '#f8fafc';
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== 'applied') {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              📝 Pending Applications
              <span style={{ 
                backgroundColor: activeTab === 'applied' ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
                color: activeTab === 'applied' ? 'white' : '#475569',
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                borderRadius: '9999px',
                fontWeight: '600'
              }}>
                {appliedElections.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('approved')}
              style={{
                flex: 1,
                padding: '1.25rem 2rem',
                backgroundColor: activeTab === 'approved' ? '#2563EB' : 'transparent',
                border: 'none',
                borderRadius: 0,
                color: activeTab === 'approved' ? 'white' : '#64748b',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
              onMouseEnter={(e) => {
                if (activeTab !== 'approved') {
                  e.currentTarget.style.backgroundColor = '#f8fafc';
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== 'approved') {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              ✓ Approved Elections
              <span style={{ 
                backgroundColor: activeTab === 'approved' ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
                color: activeTab === 'approved' ? 'white' : '#475569',
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem',
                borderRadius: '9999px',
                fontWeight: '600'
              }}>
                {approvedElections.length}
              </span>
            </button>
          </div>
        </div>

        {/* Content */}
        {activeTab === 'applied' && (
          <div>
            {appliedElections.length === 0 ? (
              <div style={{ 
                padding: '4rem 2rem', 
                textAlign: 'center',
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <div style={{ fontSize: '5rem', marginBottom: '1.5rem', opacity: 0.3 }}>📝</div>
                <h3 style={{ 
                  fontSize: '1.5rem', 
                  marginBottom: '0.75rem',
                  color: '#1e293b',
                  fontWeight: '600'
                }}>No Pending Applications</h3>
                <p style={{ 
                  fontSize: '1rem', 
                  marginBottom: '2rem',
                  color: '#64748b'
                }}>
                  You haven't applied to any elections yet, or all your applications have been processed.
                </p>
                <button
                  onClick={() => navigate('/candidate-elections', { state: { walletAddress } })}
                  style={{
                    padding: '0.875rem 1.5rem',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(37, 99, 235, 0.3)';
                  }}
                >
                  🔍 Browse Available Elections
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '1.5rem' }}>
                {appliedElections.map(renderElectionCard)}
              </div>
            )}
          </div>
        )}

        {activeTab === 'approved' && (
          <div>
            {approvedElections.length === 0 ? (
              <div style={{ 
                padding: '4rem 2rem', 
                textAlign: 'center',
                background: 'white',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <div style={{ fontSize: '5rem', marginBottom: '1.5rem', opacity: 0.3 }}>🏆</div>
                <h3 style={{ 
                  fontSize: '1.5rem', 
                  marginBottom: '0.75rem',
                  color: '#1e293b',
                  fontWeight: '600'
                }}>No Approved Elections Yet</h3>
                <p style={{ 
                  fontSize: '1rem', 
                  marginBottom: '2rem',
                  color: '#64748b'
                }}>
                  You don't have any approved elections at the moment. Keep checking back!
                </p>
                <button
                  onClick={() => setActiveTab('applied')}
                  style={{
                    padding: '0.875rem 1.5rem',
                    background: '#f8fafc',
                    color: '#475569',
                    border: '2px solid #cbd5e1',
                    borderRadius: '12px',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#f1f5f9';
                    e.currentTarget.style.borderColor = '#94a3b8';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#f8fafc';
                    e.currentTarget.style.borderColor = '#cbd5e1';
                  }}
                >
                  📝 View Pending Applications
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '1.5rem' }}>
                {approvedElections.map(renderElectionCard)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
