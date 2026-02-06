import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getDeployedContract } from '../utils/contractUtils';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import MessageAlert from '../components/MessageAlert';

export default function ElectionResults() {
  const navigate = useNavigate();
  const location = useLocation();
  const electionId = location.state?.electionId;

  const [contract, setContract] = useState(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [electionInfo, setElectionInfo] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    initializeWeb3();
  }, []);

  useEffect(() => {
    if (message.text) {
      const timer = setTimeout(() => {
        setMessage({ text: '', type: '' });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  const initializeWeb3 = async () => {
    if (!electionId) {
      setMessage({ text: 'No election ID provided', type: 'error' });
      setTimeout(() => navigate(-1), 2000);
      return;
    }

    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts',
        });

        setWalletAddress(accounts[0]);

        const { deployedContract } = await getDeployedContract();
        setContract(deployedContract);

        await loadElectionResults(deployedContract, electionId);
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
    setLoading(false);
  };

  const loadElectionResults = async (contractInstance, electionId) => {
    try {
      // Get election info
      const info = await contractInstance.methods.getElectionInfo(electionId).call();
      
      setElectionInfo({
        id: electionId,
        title: info.title,
        description: info.description,
        organizer: info.organizer,
        nominationStartTime: Number(info.nominationStartTime),
        nominationEndTime: Number(info.nominationEndTime),
        startTime: Number(info.startTime),
        endTime: Number(info.endTime),
        isActive: info.isActive,
        createdAt: Number(info.createdAt)
      });

      // Get total votes
      const totalVotes = await contractInstance.methods.getElectionTotalVotes(electionId).call();

      // Get approved candidates
      const approvedCandidates = await contractInstance.methods.getApprovedCandidates(electionId).call();

      // Get candidate details and votes
      const candidateData = [];
      for (let candidateAddr of approvedCandidates) {
        const candidateInfo = await contractInstance.methods.getCandidateInfo(candidateAddr).call();
        const votes = await contractInstance.methods.getCandidateVotes(electionId, candidateAddr).call();
        
        candidateData.push({
          address: candidateAddr,
          name: candidateInfo.name,
          party: candidateInfo.party,
          manifesto: candidateInfo.manifesto,
          votes: Number(votes),
          percentage: totalVotes > 0 ? ((Number(votes) / Number(totalVotes)) * 100).toFixed(2) : 0
        });
      }

      // Sort by votes (descending)
      candidateData.sort((a, b) => b.votes - a.votes);

      setCandidates(candidateData);
    } catch (error) {
      console.error('Error loading election results:', error);
      setMessage({ text: 'Error loading election results', type: 'error' });
    }
  };

  const getElectionStatus = () => {
    if (!electionInfo) return 'Unknown';
    const now = Math.floor(Date.now() / 1000);
    
    if (now >= electionInfo.nominationStartTime && now <= electionInfo.nominationEndTime) {
      return 'Nominating';
    } else if (now >= electionInfo.startTime && now <= electionInfo.endTime) {
      return 'Voting Ongoing';
    } else if (now > electionInfo.endTime) {
      return 'Completed';
    } else if (now > electionInfo.nominationEndTime && now < electionInfo.startTime) {
      return 'Awaiting Voting';
    } else {
      return 'Upcoming';
    }
  };

  const formatDateTime = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const handleLogout = () => {
    navigate('/');
  };

  const getTotalVotes = () => {
    return candidates.reduce((sum, candidate) => sum + candidate.votes, 0);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Loading election results...</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <Navbar walletAddress={walletAddress} userRole="organizer" onLogout={handleLogout} />
      <Sidebar userRole="organizer" />
      <MessageAlert message={message.text} type={message.type} />

      <div className="page-container" style={{ marginLeft: '90px', paddingTop: 'calc(70px + 2.5rem)' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <button
            onClick={() => navigate(-1)}
            className="btn btn-outline"
            style={{ marginBottom: '1.5rem' }}
          >
            ← Back
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '2rem' }}>📊</span>
            <h1 className="card-title" style={{ fontSize: '2rem', margin: 0 }}>Election Results</h1>
          </div>
        </div>

        {electionInfo && (
          <>
            {/* Election Info Card */}
            <div className="card" style={{ marginBottom: '2rem', borderLeft: '4px solid #2563EB' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <h2 className="card-title" style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}>{electionInfo.title}</h2>
                  <p className="card-subtitle" style={{ marginBottom: '0.5rem' }}>{electionInfo.description}</p>
                  <span className="badge" style={{ fontSize: '0.8rem' }}>Election ID: {electionInfo.id}</span>
                </div>
                <span className={`badge ${getElectionStatus() === 'Completed' ? 'badge-info' : getElectionStatus() === 'Voting Ongoing' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '1rem', padding: '0.75rem 1.5rem' }}>
                  {getElectionStatus() === 'Completed' ? '✓ ' : getElectionStatus() === 'Voting Ongoing' ? '🔴 ' : '⏱️ '}
                  {getElectionStatus()}
                </span>
              </div>

              <div className="stats-grid" style={{ marginTop: '1.5rem' }}>
                <div className="stat-card">
                  <div className="stat-label">📅 Voting Period</div>
                  <div style={{ fontSize: '0.9rem', color: '#475569', marginTop: '0.5rem' }}>
                    {formatDateTime(electionInfo.startTime)}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>to</div>
                  <div style={{ fontSize: '0.9rem', color: '#475569' }}>
                    {formatDateTime(electionInfo.endTime)}
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">🗳️ Total Votes Cast</div>
                  <div className="stat-value">{getTotalVotes()}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">👥 Total Candidates</div>
                  <div className="stat-value">{candidates.length}</div>
                </div>
              </div>
            </div>

            {/* Results Summary */}
            {candidates.length === 0 ? (
              <div className="card" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                <div style={{ fontSize: '5rem', marginBottom: '1.5rem', opacity: 0.3 }}>👥</div>
                <h3 className="card-title" style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>No Candidates</h3>
                <p className="card-subtitle" style={{ fontSize: '1rem' }}>No candidates have been approved for this election yet.</p>
              </div>
            ) : (
              <div className="card">
                <h2 className="card-title" style={{ marginBottom: '2rem' }}>
                  🏆 Candidate Results
                </h2>

                {/* Winner Card (if voting completed) */}
                {getElectionStatus() === 'Completed' && candidates.length > 0 && candidates[0].votes > 0 && (
                  <div className="card" style={{
                    background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                    color: 'white',
                    border: 'none',
                    marginBottom: '2rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '4rem' }}>🏆</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.5rem' }}>WINNER</div>
                        <h2 style={{ fontSize: '2rem', margin: '0 0 0.5rem 0' }}>{candidates[0].name}</h2>
                        <p style={{ margin: 0, fontSize: '1.1rem', opacity: 0.9 }}>{candidates[0].party}</p>
                      </div>
                    </div>
                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                      <div>
                        <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Votes Received</div>
                        <div style={{ fontSize: '2rem', fontWeight: '700' }}>{candidates[0].votes}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Vote Share</div>
                        <div style={{ fontSize: '2rem', fontWeight: '700' }}>{candidates[0].percentage}%</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* All Candidates Results */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {candidates.map((candidate, index) => (
                    <div
                      key={candidate.address}
                      className="card"
                      style={{
                        borderLeft: index === 0 && getElectionStatus() === 'Completed' ? '4px solid #f59e0b' : '4px solid #e2e8f0',
                        background: index === 0 && getElectionStatus() === 'Completed' ? 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)' : 'white'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                            <span className="badge" style={{ 
                              fontSize: '1.25rem',
                              padding: '0.5rem 0.75rem',
                              background: index === 0 ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' : '#64748b',
                              color: 'white'
                            }}>
                              #{index + 1}
                            </span>
                            <h3 className="card-title" style={{ margin: 0, fontSize: '1.5rem' }}>{candidate.name}</h3>
                            <span className="badge badge-info" style={{ fontSize: '0.875rem' }}>{candidate.party}</span>
                          </div>
                          <p style={{ color: '#64748b', margin: '0.5rem 0 0 0', fontSize: '0.875rem', fontFamily: 'monospace' }}>
                            {candidate.address.substring(0, 15)}...{candidate.address.substring(candidate.address.length - 10)}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div className="stat-value" style={{ fontSize: '2.5rem', lineHeight: 1 }}>
                            {candidate.votes}
                          </div>
                          <div className="stat-label" style={{ marginTop: '0.25rem' }}>votes</div>
                        </div>
                      </div>

                      {/* Vote Percentage Bar */}
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{
                          width: '100%',
                          height: '40px',
                          backgroundColor: '#f1f5f9',
                          borderRadius: '20px',
                          overflow: 'hidden',
                          position: 'relative',
                          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)'
                        }}>
                          <div style={{
                            width: `${candidate.percentage}%`,
                            height: '100%',
                            background: index === 0 ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)' : 
                                       index === 1 ? 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)' :
                                       'linear-gradient(90deg, #64748b 0%, #475569 100%)',
                            transition: 'width 1s ease',
                            display: 'flex',
                            alignItems: 'center',
                            paddingLeft: '1.25rem',
                            color: 'white',
                            fontWeight: 'bold',
                            fontSize: '1rem',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                          }}>
                            {candidate.percentage}%
                          </div>
                        </div>
                      </div>

                      {/* Manifesto */}
                      {candidate.manifesto && (
                        <div className="card" style={{ background: '#fafbfc', padding: '1.25rem', marginTop: '1rem' }}>
                          <div className="form-label" style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                            📋 Manifesto
                          </div>
                          <p style={{ color: '#475569', margin: 0, fontSize: '0.95rem', lineHeight: '1.6' }}>
                            {candidate.manifesto}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
