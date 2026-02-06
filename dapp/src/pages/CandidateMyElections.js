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
      display: 'inline-block'
    };

    switch (status) {
      case 1: return { ...baseStyle, backgroundColor: '#fff3cd', color: '#856404' };
      case 2: return { ...baseStyle, backgroundColor: '#d4edda', color: '#155724' };
      case 3: return { ...baseStyle, backgroundColor: '#f8d7da', color: '#721c24' };
      default: return baseStyle;
    }
  };

  const formatDateTime = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
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
        className="card"
        style={{
          borderLeft: election.applicationStatus === 2 ? '4px solid #10b981' : 
                     election.applicationStatus === 1 ? '4px solid #f59e0b' : 
                     '4px solid #ef4444',
          transition: 'all 0.3s ease'
        }}
      >
        <div className="card-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                <h3 className="card-title" style={{ fontSize: '1.375rem', margin: 0 }}>
                  {election.title}
                </h3>
                <span className="badge" style={{ fontSize: '0.7rem' }}>#{election.id}</span>
              </div>
              <p className="card-subtitle" style={{ margin: 0 }}>{election.description}</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexDirection: 'column', alignItems: 'flex-end' }}>
              <span style={getApplicationStatusStyle(election.applicationStatus)}>
                {getApplicationStatusText(election.applicationStatus)}
              </span>
              <span className={`badge ${votingStatus === 'Active' ? 'badge-success' : votingStatus === 'Upcoming' ? 'badge-warning' : 'badge-info'}`}>
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
          <div className="stat-card" style={{ padding: '1rem', background: '#f8fafc' }}>
            <div className="stat-label">Voting Period</div>
            <div style={{ fontSize: '0.875rem', color: '#1e293b', marginTop: '0.25rem' }}>
              {formatDateTime(election.startTime)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>to</div>
            <div style={{ fontSize: '0.875rem', color: '#1e293b' }}>
              {formatDateTime(election.endTime)}
            </div>
          </div>
        </div>

        {election.applicationStatus === 2 && votingStatus === 'Active' && (
          <div className="alert alert-success" style={{ marginTop: '1rem' }}>
            <strong>✓ You are participating!</strong> Your candidacy is approved and voting is now active.
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
          <div style={{ fontSize: '1.25rem', color: '#6c757d' }}>Loading your elections...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <Navbar 
        title="BlockVote - My Elections"
        walletAddress={walletAddress}
        onLogout={handleLogout}
        userRole="candidate"
      />

      <div className="page-container" style={{ paddingTop: 'calc(70px + 2.5rem)' }}>
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '2rem' }}>📋</span>
            <h1 className="card-title" style={{ fontSize: '2rem', margin: 0 }}>
              My Election Applications
            </h1>
          </div>
          <p className="card-subtitle" style={{ fontSize: '1.05rem' }}>
            Track your election applications and participation status
          </p>
        </div>

        <MessageAlert message={message} type={messageType} onClose={() => setMessage('')} />

        {candidateInfo && (
          <div className="card" style={{ marginBottom: '2rem', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '2rem' }}>🎯</span>
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

        {/* Modern Tabs */}
        <div className="card" style={{ padding: '0', marginBottom: '2rem', overflow: 'hidden' }}>
          <div style={{
            display: 'flex',
            gap: '0',
            borderBottom: '2px solid #e2e8f0'
          }}>
            <button
              onClick={() => setActiveTab('applied')}
              className="btn"
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
                transition: 'all 0.3s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              📝 Pending Applications
              <span className="badge" style={{ 
                backgroundColor: activeTab === 'applied' ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
                color: activeTab === 'applied' ? 'white' : '#475569',
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem'
              }}>
                {appliedElections.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('approved')}
              className="btn"
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
                transition: 'all 0.3s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem'
              }}
            >
              ✓ Approved Elections
              <span className="badge" style={{ 
                backgroundColor: activeTab === 'approved' ? 'rgba(255,255,255,0.2)' : '#e2e8f0',
                color: activeTab === 'approved' ? 'white' : '#475569',
                padding: '0.25rem 0.5rem',
                fontSize: '0.75rem'
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
              <div className="card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                <div style={{ fontSize: '5rem', marginBottom: '1.5rem', opacity: 0.3 }}>📝</div>
                <h3 className="card-title" style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>No Pending Applications</h3>
                <p className="card-subtitle" style={{ fontSize: '1rem', marginBottom: '2rem' }}>
                  You haven't applied to any elections yet, or all your applications have been processed.
                </p>
                <button
                  onClick={() => navigate('/candidate-elections', { state: { walletAddress } })}
                  className="btn btn-primary"
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
              <div className="card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                <div style={{ fontSize: '5rem', marginBottom: '1.5rem', opacity: 0.3 }}>🏆</div>
                <h3 className="card-title" style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>No Approved Elections Yet</h3>
                <p className="card-subtitle" style={{ fontSize: '1rem', marginBottom: '2rem' }}>
                  You don't have any approved elections at the moment. Keep checking back!
                </p>
                <button
                  onClick={() => setActiveTab('applied')}
                  className="btn btn-secondary"
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
