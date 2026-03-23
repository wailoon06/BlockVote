import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getDeployedContract } from '../utils/contractUtils';
import MessageAlert from '../components/MessageAlert';
import Navbar from '../components/Navbar';

export default function CandidateElections() {
  const navigate = useNavigate();
  const location = useLocation();
  const [walletAddress, setWalletAddress] = useState(location.state?.walletAddress || '');
  const [elections, setElections] = useState([]);
  const [candidateInfo, setCandidateInfo] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(null);

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
          await loadElections(deployedContract, address);
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
        await loadElections(deployedContract, address);
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

  const loadElections = async (contract, address) => {
    try {
      const totalElections = await contract.methods.getTotalElections().call();
      const electionsData = [];

      for (let i = 1; i <= totalElections; i++) {
        const info = await contract.methods.getElectionInfo(i).call();
        const applicationStatus = await contract.methods.candidateApplicationStatus(i, address).call();
        
        electionsData.push({
          id: i,
          title: info.title,
          description: info.description,
          nominationStartTime: Number(info.nominationStartTime),
          nominationEndTime: Number(info.nominationEndTime),
          startTime: Number(info.startTime),
          endTime: Number(info.endTime),
          organizer: info.organizer,
          applicationStatus: Number(applicationStatus)
        });
      }

      // Sort by nomination start time (newest first)
      electionsData.sort((a, b) => b.nominationStartTime - a.nominationStartTime);
      
      setElections(electionsData);
    } catch (error) {
      console.error('Error loading elections:', error);
      setMessage('Failed to load elections: ' + error.message);
      setMessageType('danger');
    }
  };

  const handleApply = async (electionId) => {
    if (!walletAddress) return;

    setApplying(electionId);
    setMessage('Submitting application...');
    setMessageType('info');

    try {
      const { web3, deployedContract } = await getDeployedContract();
      
      await deployedContract.methods
        .applyToElection(electionId)
        .send({ 
          from: walletAddress,
          maxPriorityFeePerGas: web3.utils.toWei('30', 'gwei'), // Set above minimum 25 Gwei
          maxFeePerGas: web3.utils.toWei('45', 'gwei')
         });

      setMessage('Application submitted successfully!');
      setMessageType('success');
      
      // Reload elections to update status
      await loadElections(deployedContract, walletAddress);
    } catch (error) {
      console.error('Error applying:', error);
      let errorMsg = 'Failed to apply: ';
      if (error.message.includes('nomination window')) {
        errorMsg += 'Nomination period is not active';
      } else if (error.message.includes('already applied')) {
        errorMsg += 'You have already applied to this election';
      } else {
        errorMsg += error.message;
      }
      setMessage(errorMsg);
      setMessageType('danger');
    } finally {
      setApplying(null);
    }
  };

  const getApplicationStatusText = (status) => {
    switch (status) {
      case 0: return 'Not Applied';
      case 1: return 'Pending Approval';
      case 2: return 'Approved';
      case 3: return 'Rejected';
      default: return 'Unknown';
    }
  };

  const getApplicationStatusStyle = (status) => {
    const baseStyle = {
      padding: '6px 12px',
      borderRadius: '6px',
      fontSize: '12px',
      fontWeight: 'bold'
    };

    switch (status) {
      case 0: return { ...baseStyle, backgroundColor: '#e9ecef', color: '#6c757d' };
      case 1: return { ...baseStyle, backgroundColor: '#fff3cd', color: '#856404' };
      case 2: return { ...baseStyle, backgroundColor: '#d4edda', color: '#155724' };
      case 3: return { ...baseStyle, backgroundColor: '#f8d7da', color: '#721c24' };
      default: return baseStyle;
    }
  };

  const getNominationStatus = (election) => {
    const now = Math.floor(Date.now() / 1000);
    if (now < election.nominationStartTime) {
      return 'Upcoming';
    } else if (now >= election.nominationStartTime && now <= election.nominationEndTime) {
      return 'Open';
    } else {
      return 'Closed';
    }
  };

  const canApply = (election) => {
    const now = Math.floor(Date.now() / 1000);
    return election.applicationStatus === 0 && 
           now >= election.nominationStartTime && 
           now <= election.nominationEndTime;
  };

  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    const options = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    };
    return date.toLocaleString('en-US', options);
  };

  const handleLogout = () => {
    setWalletAddress('');
    setCandidateInfo(null);
    navigate('/');
  };

  if (loading) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        backgroundColor: '#f8fafc', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ 
            fontSize: '48px', 
            marginBottom: '16px',
            animation: 'pulse 1.5s ease-in-out infinite'
          }}>
            ⏳
          </div>
          <div style={{ 
            fontSize: '18px', 
            color: '#64748b',
            fontWeight: '600'
          }}>
            Loading elections...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Navbar 
        title="BlockVote - Available Elections"
        walletAddress={walletAddress}
        onLogout={handleLogout}
        userRole="candidate"
      />

      <div style={{ 
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '40px 30px',
        paddingTop: 'calc(70px + 40px)'
      }}>
        <div style={{ 
          marginBottom: '32px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'start', 
          flexWrap: 'wrap', 
          gap: '20px' 
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
              <span style={{ fontSize: '48px' }}>📊</span>
              <h1 style={{ 
                fontSize: '32px', 
                fontWeight: '800',
                color: '#1e293b',
                margin: 0,
                letterSpacing: '-0.02em'
              }}>
                Available Elections
              </h1>
            </div>
            <p style={{ 
              fontSize: '16px',
              color: '#64748b',
              margin: 0,
              lineHeight: '1.6'
            }}>
              Apply to participate as a candidate in upcoming elections
            </p>
          </div>
          <button
            onClick={() => navigate('/candidate-my-elections', { state: { walletAddress } })}
            style={{
              padding: '12px 24px',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '15px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap',
              transition: 'all 0.2s',
              boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#1d4ed8';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(37, 99, 235, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#2563eb';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(37, 99, 235, 0.3)';
            }}
          >
            <span>📋</span>
            My Applications
          </button>
        </div>

        <MessageAlert message={message} type={messageType} onClose={() => setMessage('')} />

        {elections.length === 0 ? (
          <div style={{ 
            padding: '4rem 2rem', 
            textAlign: 'center',
            background: 'white',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <div style={{ fontSize: '5rem', marginBottom: '1.5rem', opacity: 0.3 }}>📦</div>
            <h3 style={{ 
              fontSize: '1.5rem', 
              marginBottom: '0.75rem',
              color: '#1e293b',
              fontWeight: '600'
            }}>No Elections Available</h3>
            <p style={{ 
              fontSize: '1rem',
              color: '#64748b',
              margin: 0
            }}>There are currently no elections available for candidate applications.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            {elections.map((election) => {
              const nominationStatus = getNominationStatus(election);
              
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
                               election.applicationStatus === 3 ? '4px solid #ef4444' : '4px solid #2563EB',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    transition: 'all 0.3s ease',
                    cursor: 'default'
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
                            fontSize: '1.5rem', 
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
                          }}>ID: {election.id}</span>
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
                          background: nominationStatus === 'Open' ? '#dcfce7' : 
                                     nominationStatus === 'Upcoming' ? '#fef3c7' : '#dbeafe',
                          color: nominationStatus === 'Open' ? '#166534' : 
                                nominationStatus === 'Upcoming' ? '#92400e' : '#1e40af',
                          border: nominationStatus === 'Open' ? '1px solid #bbf7d0' : 
                                 nominationStatus === 'Upcoming' ? '1px solid #fde68a' : '1px solid #bfdbfe'
                        }}>
                          📅 {nominationStatus}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Timeline Section */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '1rem',
                    marginBottom: '1.5rem'
                  }}>
                    <div style={{ 
                      padding: '1.25rem', 
                      background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                      borderRadius: '12px',
                      border: '1px solid #bfdbfe'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>📝</span>
                        <div style={{ 
                          margin: 0, 
                          fontWeight: '600',
                          color: '#1e40af',
                          fontSize: '0.95rem'
                        }}>Nomination Period</div>
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '0.25rem' }}>
                        <strong>Start:</strong> {formatDateTime(election.nominationStartTime)}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#475569' }}>
                        <strong>End:</strong> {formatDateTime(election.nominationEndTime)}
                      </div>
                    </div>
                    <div style={{ 
                      padding: '1.25rem', 
                      background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                      borderRadius: '12px',
                      border: '1px solid #bbf7d0'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>🗳️</span>
                        <div style={{ 
                          margin: 0, 
                          fontWeight: '600',
                          color: '#166534',
                          fontSize: '0.95rem'
                        }}>Voting Period</div>
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '0.25rem' }}>
                        <strong>Start:</strong> {formatDateTime(election.startTime)}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#475569' }}>
                        <strong>End:</strong> {formatDateTime(election.endTime)}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons and Status Messages */}
                  <div>
                    {canApply(election) && (
                      <button
                        onClick={() => handleApply(election.id)}
                        disabled={applying === election.id}
                        style={{
                          width: '100%',
                          padding: '0.875rem 1.5rem',
                          background: applying === election.id ? '#94a3b8' : 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '12px',
                          fontSize: '1rem',
                          fontWeight: '600',
                          cursor: applying === election.id ? 'not-allowed' : 'pointer',
                          transition: 'all 0.3s ease',
                          boxShadow: applying === election.id ? 'none' : '0 2px 8px rgba(37, 99, 235, 0.3)'
                        }}
                        onMouseEnter={(e) => {
                          if (applying !== election.id) {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.4)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (applying !== election.id) {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(37, 99, 235, 0.3)';
                          }
                        }}
                      >
                        {applying === election.id ? '⏳ Submitting Application...' : '✍️ Apply to This Election'}
                      </button>
                    )}
                    
                    {election.applicationStatus === 1 && (
                      <div style={{
                        padding: '1rem 1.25rem',
                        background: '#fef3c7',
                        border: '1px solid #fde68a',
                        borderRadius: '12px',
                        color: '#92400e',
                        fontSize: '0.95rem',
                        fontWeight: '500'
                      }}>
                        ⏳ Your application is pending organizer approval
                      </div>
                    )}
                    
                    {election.applicationStatus === 2 && (
                      <div style={{
                        padding: '1rem 1.25rem',
                        background: '#dcfce7',
                        border: '1px solid #bbf7d0',
                        borderRadius: '12px',
                        color: '#166534',
                        fontSize: '0.95rem',
                        fontWeight: '500'
                      }}>
                        ✓ Your application has been approved! You are a candidate in this election.
                      </div>
                    )}
                    
                    {election.applicationStatus === 3 && (
                      <div style={{
                        padding: '1rem 1.25rem',
                        background: '#fee2e2',
                        border: '1px solid #fecaca',
                        borderRadius: '12px',
                        color: '#991b1b',
                        fontSize: '0.95rem',
                        fontWeight: '500'
                      }}>
                        ✗ Your application was rejected
                      </div>
                    )}

                    {!canApply(election) && election.applicationStatus === 0 && nominationStatus === 'Closed' && (
                      <div style={{
                        padding: '1rem 1.25rem',
                        background: '#dbeafe',
                        border: '1px solid #bfdbfe',
                        borderRadius: '12px',
                        color: '#1e40af',
                        fontSize: '0.95rem',
                        fontWeight: '500'
                      }}>
                        🔒 Nomination period has ended
                      </div>
                    )}

                    {!canApply(election) && election.applicationStatus === 0 && nominationStatus === 'Upcoming' && (
                      <div style={{
                        padding: '1rem 1.25rem',
                        background: '#dbeafe',
                        border: '1px solid #bfdbfe',
                        borderRadius: '12px',
                        color: '#1e40af',
                        fontSize: '0.95rem',
                        fontWeight: '500'
                      }}>
                        📅 Nomination period will begin on {formatDateTime(election.nominationStartTime)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
