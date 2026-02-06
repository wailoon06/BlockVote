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
      const { deployedContract } = await getDeployedContract();
      
      await deployedContract.methods
        .applyToElection(electionId)
        .send({ from: walletAddress });

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
    return new Date(timestamp * 1000).toLocaleString();
  };

  const handleLogout = () => {
    setWalletAddress('');
    setCandidateInfo(null);
    navigate('/');
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
          <div style={{ fontSize: '1.25rem', color: '#6c757d' }}>Loading elections...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <Navbar 
        title="BlockVote - Available Elections"
        walletAddress={walletAddress}
        onLogout={handleLogout}
        userRole="candidate"
      />

      <div className="page-container" style={{ paddingTop: 'calc(70px + 2.5rem)' }}>
        <div style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '2rem' }}>📊</span>
              <h1 className="card-title" style={{ fontSize: '2rem', margin: 0 }}>
                Available Elections
              </h1>
            </div>
            <p className="card-subtitle" style={{ fontSize: '1.05rem' }}>
              Apply to participate as a candidate in upcoming elections
            </p>
          </div>
          <button
            onClick={() => navigate('/candidate-my-elections', { state: { walletAddress } })}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}
          >
            📋 My Applications
          </button>
        </div>

        <MessageAlert message={message} type={messageType} onClose={() => setMessage('')} />

        {candidateInfo && (
          <div className="card" style={{ marginBottom: '2rem', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', border: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '2rem' }}>🏅</span>
                  <h3 className="card-title" style={{ color: 'white', margin: 0 }}>Your Candidate Profile</h3>
                </div>
                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1.5rem' }}>
                  <div>
                    <div className="form-label" style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '0.25rem' }}>Name</div>
                    <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{candidateInfo.name}</div>
                  </div>
                  <div>
                    <div className="form-label" style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '0.25rem' }}>Party</div>
                    <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{candidateInfo.party}</div>
                  </div>
                </div>
              </div>
              <span className="badge badge-success" style={{ backgroundColor: '#d1fae5', color: '#065f46', fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
                ✓ {candidateInfo.status}
              </span>
            </div>
          </div>
        )}

        {elections.length === 0 ? (
          <div className="card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '5rem', marginBottom: '1.5rem', opacity: 0.3 }}>📦</div>
            <h3 className="card-title" style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>No Elections Available</h3>
            <p className="card-subtitle" style={{ fontSize: '1rem' }}>There are currently no elections available for candidate applications.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            {elections.map((election) => {
              const nominationStatus = getNominationStatus(election);
              
              return (
                <div
                  key={election.id}
                  className="card"
                  style={{
                    borderLeft: election.applicationStatus === 2 ? '4px solid #10b981' : 
                               election.applicationStatus === 1 ? '4px solid #f59e0b' :
                               election.applicationStatus === 3 ? '4px solid #ef4444' : '4px solid #2563EB'
                  }}
                >
                  <div className="card-header">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem', gap: '1rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                          <h3 className="card-title" style={{ fontSize: '1.5rem', margin: 0 }}>
                            {election.title}
                          </h3>
                          <span className="badge" style={{ fontSize: '0.7rem' }}>ID: {election.id}</span>
                        </div>
                        <p className="card-subtitle" style={{ margin: 0 }}>{election.description}</p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span style={getApplicationStatusStyle(election.applicationStatus)}>
                          {getApplicationStatusText(election.applicationStatus)}
                        </span>
                        <span className={`badge ${nominationStatus === 'Open' ? 'badge-success' : nominationStatus === 'Upcoming' ? 'badge-warning' : 'badge-info'}`}>
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
                    <div className="card" style={{ padding: '1.25rem', background: '#eff6ff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>📝</span>
                        <div className="form-label" style={{ margin: 0, fontWeight: '600' }}>Nomination Period</div>
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#475569' }}>
                        <strong>Start:</strong> {formatDateTime(election.nominationStartTime)}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#475569' }}>
                        <strong>End:</strong> {formatDateTime(election.nominationEndTime)}
                      </div>
                    </div>
                    <div className="card" style={{ padding: '1.25rem', background: '#f0fdf4' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>🗳️</span>
                        <div className="form-label" style={{ margin: 0, fontWeight: '600' }}>Voting Period</div>
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#475569' }}>
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
                        className="btn btn-primary"
                        style={{
                          width: '100%',
                          opacity: applying === election.id ? 0.7 : 1,
                          cursor: applying === election.id ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {applying === election.id ? '⏳ Submitting Application...' : '✍️ Apply to This Election'}
                      </button>
                    )}
                    
                    {election.applicationStatus === 1 && (
                      <div className="alert alert-warning">
                        ⏳ Your application is pending organizer approval
                      </div>
                    )}
                    
                    {election.applicationStatus === 2 && (
                      <div className="alert alert-success">
                        ✓ Your application has been approved! You are a candidate in this election.
                      </div>
                    )}
                    
                    {election.applicationStatus === 3 && (
                      <div className="alert alert-error">
                        ✗ Your application was rejected
                      </div>
                    )}

                    {!canApply(election) && election.applicationStatus === 0 && nominationStatus === 'Closed' && (
                      <div className="alert alert-info">
                        🔒 Nomination period has ended
                      </div>
                    )}

                    {!canApply(election) && election.applicationStatus === 0 && nominationStatus === 'Upcoming' && (
                      <div className="alert alert-info">
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
