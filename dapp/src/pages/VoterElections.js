import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getDeployedContract } from '../utils/contractUtils';
import MessageAlert from '../components/MessageAlert';
import Navbar from '../components/Navbar';

export default function VoterElections() {
  const navigate = useNavigate();
  const location = useLocation();
  const [walletAddress, setWalletAddress] = useState(location.state?.walletAddress || '');
  const [elections, setElections] = useState([]);
  const [voterInfo, setVoterInfo] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(null);

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

          // Check if user is a verified voter
          const isVoter = await deployedContract.methods.isVoterRegistered(address).call();
          
          if (!isVoter) {
            setMessage('You need to register as a voter first');
            setMessageType('danger');
            setTimeout(() => navigate('/register'), 2000);
            return;
          }

          const info = await deployedContract.methods.getVoterInfo(address).call();
          
          if (info.status !== 'VERIFIED') {
            setMessage('Your voter profile needs to be verified first');
            setMessageType('danger');
            setTimeout(() => navigate('/verify'), 2000);
            return;
          }

          setVoterInfo(info);
          await loadElections(deployedContract, address);
        }
      } else if (address) {
        // Address from state, proceed with contract
        const { deployedContract } = await getDeployedContract();
        const isVoter = await deployedContract.methods.isVoterRegistered(address).call();
        
        if (!isVoter) {
          setMessage('You need to register as a voter first');
          setMessageType('danger');
          setTimeout(() => navigate('/register'), 2000);
          return;
        }

        const info = await deployedContract.methods.getVoterInfo(address).call();
        
        if (info.status !== 'VERIFIED') {
          setMessage('Your voter profile needs to be verified first');
          setMessageType('danger');
          setTimeout(() => navigate('/verify'), 2000);
          return;
        }

        setVoterInfo(info);
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
      const now = Math.floor(Date.now() / 1000);

      for (let i = 1; i <= totalElections; i++) {
        const info = await contract.methods.getElectionInfo(i).call();
        const hasVoted = await contract.methods.hasVoterVoted(i, address).call();
        const totalVotes = await contract.methods.getElectionTotalVotes(i).call();
        
        // Only show elections that are currently open for voting
        if (Number(info.startTime) <= now && now <= Number(info.endTime)) {
          // Get approved candidates
          const approvedCandidates = await contract.methods.getApprovedCandidates(i).call();
          const candidatesWithInfo = [];

          for (let candidateAddr of approvedCandidates) {
            const candidateInfo = await contract.methods.getCandidateInfo(candidateAddr).call();
            const votes = await contract.methods.getCandidateVotes(i, candidateAddr).call();
            candidatesWithInfo.push({
              address: candidateAddr,
              name: candidateInfo.name,
              party: candidateInfo.party,
              manifesto: candidateInfo.manifesto,
              votes: Number(votes)
            });
          }

          electionsData.push({
            id: i,
            title: info.title,
            description: info.description,
            startTime: Number(info.startTime),
            endTime: Number(info.endTime),
            organizer: info.organizer,
            hasVoted: hasVoted,
            totalVotes: Number(totalVotes),
            candidates: candidatesWithInfo
          });
        }
      }

      setElections(electionsData);
    } catch (error) {
      console.error('Error loading elections:', error);
      setMessage('Failed to load elections');
      setMessageType('danger');
    }
  };

  const handleVote = async (electionId, candidateAddress) => {
    if (voting) return;
    
    setVoting(electionId);
    
    try {
      const { deployedContract, web3 } = await getDeployedContract();
      
      await deployedContract.methods
        .vote(electionId, candidateAddress)
        .send({ from: walletAddress });
      
      setMessage('Vote cast successfully!');
      setMessageType('success');
      
      // Reload elections to update vote status
      await loadElections(deployedContract, walletAddress);
    } catch (error) {
      console.error('Error voting:', error);
      let errorMsg = 'Failed to cast vote';
      
      if (error.message.includes('Already voted')) {
        errorMsg = 'You have already voted in this election';
      } else if (error.message.includes('Not voting period')) {
        errorMsg = 'Voting period is not active';
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      setMessage(errorMsg);
      setMessageType('danger');
    } finally {
      setVoting(null);
    }
  };

  const getVotingStatus = (election) => {
    const now = Math.floor(Date.now() / 1000);
    const timeLeft = election.endTime - now;
    
    if (timeLeft < 0) return 'Ended';
    
    const hours = Math.floor(timeLeft / 3600);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days > 1 ? 's' : ''} left`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} left`;
    return 'Ending soon';
  };

  const formatDateTime = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const handleLogout = () => {
    setWalletAddress('');
    setVoterInfo(null);
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
        title="BlockVote - Active Elections"
        walletAddress={walletAddress}
        onLogout={handleLogout}
        userRole="voter"
      />

      <div className="page-container" style={{ paddingTop: 'calc(70px + 2.5rem)' }}>
        {/* Header Section */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '2rem' }}>🗳️</span>
            <h1 className="card-title" style={{ fontSize: '2rem', margin: 0 }}>
              Active Elections
            </h1>
          </div>
          <p className="card-subtitle" style={{ fontSize: '1.05rem' }}>
            Cast your vote in ongoing elections and make your voice heard
          </p>
        </div>

        <MessageAlert message={message} type={messageType} onClose={() => setMessage('')} />

        {voterInfo && (
          <div className="card" style={{ marginBottom: '2rem', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white', border: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '2rem' }}>👤</span>
                  <h3 className="card-title" style={{ color: 'white', margin: 0 }}>Your Voter Profile</h3>
                </div>
                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1.5rem' }}>
                  <div>
                    <div className="form-label" style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '0.25rem' }}>Name</div>
                    <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{voterInfo.name}</div>
                  </div>
                  <div>
                    <div className="form-label" style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '0.25rem' }}>Email</div>
                    <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{voterInfo.email}</div>
                  </div>
                </div>
              </div>
              <span className="badge badge-success" style={{ backgroundColor: '#10b981', color: 'white', fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
                ✓ {voterInfo.status}
              </span>
            </div>
          </div>
        )}

        {elections.length === 0 ? (
          <div className="card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '5rem', marginBottom: '1.5rem', opacity: 0.3 }}>🗳️</div>
            <h3 className="card-title" style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>No Active Elections</h3>
            <p className="card-subtitle" style={{ fontSize: '1rem' }}>
              There are currently no elections open for voting. Check back later!
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            {elections.map((election) => (
              <div
                key={election.id}
                className="card"
                style={{
                  overflow: 'hidden',
                  borderLeft: election.hasVoted ? '4px solid #10b981' : '4px solid #2563EB',
                  transition: 'all 0.3s ease'
                }}
              >
                <div className="card-header" style={{ paddingBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                        <h3 className="card-title" style={{ fontSize: '1.5rem', margin: 0 }}>
                          {election.title}
                        </h3>
                        <span className="badge" style={{ fontSize: '0.7rem' }}>ID: {election.id}</span>
                      </div>
                      <p className="card-subtitle" style={{ marginBottom: '0' }}>{election.description}</p>
                    </div>
                    <div style={{ textAlign: 'right', marginLeft: '1rem' }}>
                      {election.hasVoted ? (
                        <span className="badge badge-success" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
                          ✓ Vote Cast
                        </span>
                      ) : (
                        <span className="badge badge-warning" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
                          ⏱️ {getVotingStatus(election)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginTop: '1rem' }}>
                    <div className="stat-card" style={{ padding: '1rem', background: '#f8fafc' }}>
                      <div className="stat-label">Ends At</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#1e293b' }}>{formatDateTime(election.endTime)}</div>
                    </div>
                    <div className="stat-card" style={{ padding: '1rem', background: '#f8fafc' }}>
                      <div className="stat-label">Total Votes Cast</div>
                      <div className="stat-value" style={{ fontSize: '1.75rem' }}>{election.totalVotes}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="card-title" style={{ fontSize: '1.125rem', marginBottom: '1.25rem' }}>
                    📋 Candidates ({election.candidates.length})
                  </h4>
                  
                  {election.candidates.length === 0 ? (
                    <div className="alert alert-info">
                      No approved candidates for this election yet.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                      {election.candidates.map((candidate) => (
                        <div
                          key={candidate.address}
                          className="card"
                          style={{
                            padding: '1.5rem',
                            background: 'linear-gradient(135deg, #fafbfc 0%, #f8fafc 100%)',
                            border: election.hasVoted ? '2px solid #10b981' : '2px solid #e2e8f0',
                            transition: 'all 0.3s ease'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1.5rem' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '1.75rem' }}>👨‍💼</span>
                                <h5 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                                  {candidate.name}
                                </h5>
                                {candidate.party && (
                                  <span className="badge badge-info">
                                    {candidate.party}
                                  </span>
                                )}
                              </div>
                              {candidate.manifesto && (
                                <div style={{ padding: '1rem', background: 'white', borderRadius: '8px', marginTop: '0.75rem' }}>
                                  <div className="form-label" style={{ marginBottom: '0.5rem' }}>Manifesto</div>
                                  <p style={{ color: '#475569', fontSize: '0.95rem', margin: 0, lineHeight: '1.6' }}>
                                    {candidate.manifesto}
                                  </p>
                                </div>
                              )}
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                              {election.hasVoted ? (
                                <span className="badge badge-success" style={{ padding: '0.75rem 1.25rem', fontSize: '0.95rem' }}>
                                  ✓ Voted
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleVote(election.id, candidate.address)}
                                  disabled={voting === election.id}
                                  className="btn btn-primary"
                                  style={{
                                    opacity: voting === election.id ? 0.7 : 1,
                                    cursor: voting === election.id ? 'not-allowed' : 'pointer',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  {voting === election.id ? '⏳ Voting...' : '🗳️ Cast Vote'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
