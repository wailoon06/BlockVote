import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import MessageAlert from '../components/MessageAlert';
import { getDeployedContract } from '../utils/contractUtils';

function CandidateDashboard() {
  const navigate = useNavigate();
  const [contract, setContract] = useState(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [candidateInfo, setCandidateInfo] = useState(null);
  const [myElections, setMyElections] = useState([]);
  const [statistics, setStatistics] = useState({
    totalApplications: 0,
    pendingApplications: 0,
    approvedElections: 0,
    rejectedApplications: 0
  });
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    initializeWeb3();
  }, []);

  useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => {
        setMessage({ text: '', type: '' });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const initializeWeb3 = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts',
        });

        setWalletAddress(accounts[0]);

        const { deployedContract } = await getDeployedContract();
        setContract(deployedContract);

        await checkCandidateStatus(deployedContract, accounts[0]);
        await loadMyElections(deployedContract, accounts[0]);
      } catch (error) {
        console.error('Error initializing Web3:', error);
        setMessage({ text: 'Failed to connect to wallet', type: 'error' });
      }
    } else {
      setMessage({
        text: 'Please install MetaMask to use this application',
        type: 'error',
      });
    }
  };

  const checkCandidateStatus = async (contractInstance, address) => {
    try {
      const isRegistered = await contractInstance.methods
        .isCandidateRegistered(address)
        .call();

      if (!isRegistered) {
        setMessage({ text: 'You are not registered as a candidate', type: 'error' });
        setTimeout(() => navigate('/'), 2000);
        return;
      }

      const info = await contractInstance.methods
        .getCandidateInfo(address)
        .call();

      if (info.status !== 'VERIFIED') {
        setMessage({ text: 'Your candidate profile needs to be verified first', type: 'warning' });
        setTimeout(() => navigate('/candidate-verify'), 2000);
        return;
      }

      setCandidateInfo({
        name: info.name,
        email: info.email,
        party: info.party,
        manifesto: info.manifesto,
        status: info.status,
        registeredAt: new Date(Number(info.registeredAt) * 1000).toLocaleDateString(),
        verifiedAt: new Date(Number(info.verifiedAt) * 1000).toLocaleDateString()
      });
    } catch (error) {
      console.error('Error checking candidate status:', error);
      setMessage({ text: 'Error verifying candidate status', type: 'error' });
    }
  };

  const loadMyElections = async (contractInstance, address) => {
    try {
      const totalElections = await contractInstance.methods.getTotalElections().call();
      const electionsData = [];
      let totalApplications = 0;
      let pendingApplications = 0;
      let approvedElections = 0;
      let rejectedApplications = 0;

      for (let i = 1; i <= totalElections; i++) {
        const applicationStatus = await contractInstance.methods
          .candidateApplicationStatus(i, address)
          .call();

        if (Number(applicationStatus) > 0) {
          const info = await contractInstance.methods.getElectionInfo(i).call();

          const election = {
            id: i,
            title: info.title,
            description: info.description,
            nominationStartTime: Number(info.nominationStartTime),
            nominationEndTime: Number(info.nominationEndTime),
            startTime: Number(info.startTime),
            endTime: Number(info.endTime),
            applicationStatus: Number(applicationStatus),
            createdAt: Number(info.createdAt)
          };

          electionsData.push(election);
          totalApplications++;

          if (Number(applicationStatus) === 1) pendingApplications++;
          if (Number(applicationStatus) === 2) approvedElections++;
          if (Number(applicationStatus) === 3) rejectedApplications++;
        }
      }

      electionsData.sort((a, b) => b.createdAt - a.createdAt);

      setMyElections(electionsData);
      setStatistics({
        totalApplications,
        pendingApplications,
        approvedElections,
        rejectedApplications
      });
    } catch (error) {
      console.error('Error loading elections:', error);
      setMessage({ text: 'Error loading elections', type: 'error' });
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

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #f8fafc 0%, #e2e8f0 100%)' }}>
      <Navbar 
        title="BlockVote - Candidate Dashboard"
        walletAddress={walletAddress}
        onLogout={handleLogout}
        userRole="candidate"
        userStatus={candidateInfo?.status}
      />
      <Sidebar userRole="candidate" />

      <div style={{ 
        marginLeft: '70px',
        maxWidth: 'calc(1400px + 70px)',
        padding: '2.5rem 2rem',
        paddingTop: 'calc(70px + 2.5rem)'
      }}>
        <MessageAlert 
          message={message.text} 
          type={message.type} 
          onClose={() => setMessage({ text: '', type: '' })} 
        />

        {/* Header Section */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '2rem' }}>🎯</span>
            <h1 style={{ 
              fontSize: '2rem', 
              margin: 0,
              color: '#1e293b',
              fontWeight: '700'
            }}>
              Candidate Dashboard
            </h1>
          </div>
          <p style={{ 
            fontSize: '1.05rem',
            color: '#64748b',
            margin: 0
          }}>
            Welcome back, {candidateInfo?.name || 'Candidate'}! Manage your election applications
          </p>
        </div>

        {/* Candidate Profile Card */}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '1.5rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '2rem' }}>👤</span>
                  <h3 style={{ color: 'white', margin: 0, fontSize: '1.5rem', fontWeight: '600' }}>Your Profile</h3>
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
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>Email</div>
                    <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{candidateInfo.email}</div>
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

        {/* Statistics Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2.5rem'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '1.75rem',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            e.currentTarget.style.transform = 'translateY(-4px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem'
              }}>
                📊
              </div>
              <div>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem', fontWeight: '500' }}>
                  Total Applications
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1e293b' }}>
                  {statistics.totalApplications}
                </div>
              </div>
            </div>
          </div>

          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '1.75rem',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            e.currentTarget.style.transform = 'translateY(-4px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem'
              }}>
                ⏳
              </div>
              <div>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem', fontWeight: '500' }}>
                  Pending Review
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1e293b' }}>
                  {statistics.pendingApplications}
                </div>
              </div>
            </div>
          </div>

          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '1.75rem',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            e.currentTarget.style.transform = 'translateY(-4px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem'
              }}>
                ✓
              </div>
              <div>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem', fontWeight: '500' }}>
                  Approved
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1e293b' }}>
                  {statistics.approvedElections}
                </div>
              </div>
            </div>
          </div>

          <div style={{
            background: 'white',
            borderRadius: '16px',
            padding: '1.75rem',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
            e.currentTarget.style.transform = 'translateY(-4px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem'
              }}>
                ✗
              </div>
              <div>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem', fontWeight: '500' }}>
                  Rejected
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1e293b' }}>
                  {statistics.rejectedApplications}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* My Elections Section */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <span style={{ fontSize: '1.75rem' }}>📋</span>
            <h2 style={{ 
              fontSize: '1.75rem', 
              margin: 0,
              color: '#1e293b',
              fontWeight: '600'
            }}>
              My Elections
            </h2>
          </div>

          {myElections.length === 0 ? (
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
              }}>No Election Applications Yet</h3>
              <p style={{ 
                fontSize: '1rem', 
                marginBottom: '2rem',
                color: '#64748b'
              }}>
                You haven't applied to any elections yet. Browse available elections to get started!
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
              {myElections.map((election) => {
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
                      gap: '1rem'
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CandidateDashboard;
