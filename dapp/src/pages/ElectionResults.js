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
  const [totalVotes, setTotalVotes] = useState(0);
  const [phase4Result, setPhase4Result] = useState(null);
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
      const totalVotesBN = await contractInstance.methods.getElectionTotalVotes(electionId).call();
      setTotalVotes(Number(totalVotesBN));

      // Check if Phase 4 results are published
      let phase4Result = null;
      try {
        const res = await contractInstance.methods.getResults(electionId).call();
        if (res.resultsPublished) {
          phase4Result = JSON.parse(res.decryptedResult);
          setPhase4Result(phase4Result);
        }
      } catch (_) {}

      // Get approved candidates
      const approvedCandidates = await contractInstance.methods.getApprovedCandidates(electionId).call();

      // Get candidate details
      const candidateData = [];
      for (let candidateAddr of approvedCandidates) {
        const candidateInfo = await contractInstance.methods.getCandidateInfo(candidateAddr).call();
        candidateData.push({
          address: candidateAddr,
          name: candidateInfo.name,
          party: candidateInfo.party,
          manifesto: candidateInfo.manifesto,
          votes: 0,
          percentage: 0
        });
      }

      // If Phase 4 results are published, apply per-candidate vote counts
      if (phase4Result?.per_candidate_votes) {
        const tv = phase4Result.total_votes || Number(totalVotesBN) || 1;
        candidateData.forEach((c, idx) => {
          c.votes = phase4Result.per_candidate_votes[String(idx)] || 0;
          c.percentage = tv > 0 ? Math.round((c.votes / tv) * 100) : 0;
        });
      }

      // Sort by votes (descending)
      candidateData.sort((a, b) => b.votes - a.votes);

      // Competition ranking with ties: 1, 1, 3 (not 1, 1, 2)
      let previousVotes = null;
      let currentRank = 0;
      candidateData.forEach((candidate, index) => {
        if (previousVotes === null || candidate.votes < previousVotes) {
          currentRank = index + 1;
          previousVotes = candidate.votes;
        }
        candidate.rank = currentRank;
      });

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
    navigate('/');
  };

  const getTotalVotes = () => {
    return totalVotes;
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
            📊
          </div>
          <h2 style={{
            fontSize: '18px',
            color: '#64748b',
            fontWeight: '600',
            margin: 0
          }}>
            Loading election results...
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Navbar walletAddress={walletAddress} userRole="organizer" onLogout={handleLogout} />
      <Sidebar userRole="organizer" />
      <MessageAlert message={message.text} type={message.type} />

      <div style={{ 
        margin: '0',
        marginLeft: '70px',
        padding: '40px 30px',
        paddingTop: 'calc(70px + 40px)',
        maxWidth: '1600px'
      }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: '12px 20px',
              backgroundColor: 'white',
              color: '#1e293b',
              border: '2px solid #e2e8f0',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '15px',
              marginBottom: '24px',
              fontWeight: '600',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#f8fafc';
              e.target.style.borderColor = '#cbd5e1';
              e.target.style.transform = 'translateX(-4px)';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'white';
              e.target.style.borderColor = '#e2e8f0';
              e.target.style.transform = 'translateX(0)';
            }}
          >
            <span>←</span>
            Back
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '48px' }}>📊</span>
            <h1 style={{ 
              fontSize: '32px', 
              fontWeight: '800',
              color: '#1e293b',
              margin: 0,
              letterSpacing: '-0.02em'
            }}>
              Election Results
            </h1>
          </div>
        </div>

        {electionInfo && (
          <>
            {/* Election Info Card */}
            <div style={{
              backgroundColor: 'white',
              padding: '32px',
              borderRadius: '16px',
              marginBottom: '32px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'start', 
                marginBottom: '24px', 
                flexWrap: 'wrap', 
                gap: '16px' 
              }}>
                <div style={{ flex: 1, minWidth: '300px' }}>
                  <h2 style={{ 
                    fontSize: '28px', 
                    fontWeight: '700',
                    marginBottom: '12px',
                    color: '#1e293b'
                  }}>
                    {electionInfo.title}
                  </h2>
                  <p style={{ 
                    marginBottom: '12px',
                    color: '#64748b',
                    fontSize: '16px',
                    lineHeight: '1.6'
                  }}>
                    {electionInfo.description}
                  </p>
                  <span style={{
                    display: 'inline-block',
                    padding: '6px 12px',
                    backgroundColor: '#f1f5f9',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#475569',
                    fontFamily: 'monospace'
                  }}>
                    ID: {electionInfo.id}
                  </span>
                </div>
                <span style={{
                  padding: '12px 24px',
                  borderRadius: '24px',
                  fontSize: '15px',
                  fontWeight: '700',
                  letterSpacing: '0.02em',
                  ...(getElectionStatus() === 'Completed' 
                    ? { backgroundColor: '#dbeafe', color: '#1e40af' }
                    : getElectionStatus() === 'Voting Ongoing'
                    ? { backgroundColor: '#dcfce7', color: '#166534' }
                    : { backgroundColor: '#fef3c7', color: '#92400e' })
                }}>
                  {getElectionStatus() === 'Completed' ? '✓' : 
                   getElectionStatus() === 'Voting Ongoing' ? '🔴' : '⏱️'}{' '}
                  {getElectionStatus()}
                </span>
              </div>

              {/* Statistics Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '20px'
              }}>
                <div style={{
                  padding: '20px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0'
                }}>
                  <div style={{ 
                    color: '#64748b', 
                    fontSize: '13px', 
                    marginBottom: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span style={{ fontSize: '18px' }}>📅</span>
                    Voting Period
                  </div>
                  <div style={{ fontSize: '14px', color: '#1e293b', lineHeight: '1.6' }}>
                    <div style={{ marginBottom: '6px' }}>
                      <strong>Start:</strong> {formatDateTime(electionInfo.startTime)}
                    </div>
                    <div>
                      <strong>End:</strong> {formatDateTime(electionInfo.endTime)}
                    </div>
                  </div>
                </div>
                <div style={{
                  padding: '20px',
                  backgroundColor: '#f0fdf4',
                  borderRadius: '12px',
                  border: '1px solid #bbf7d0'
                }}>
                  <div style={{ 
                    color: '#166534', 
                    fontSize: '13px', 
                    marginBottom: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span style={{ fontSize: '18px' }}>🗳️</span>
                    Total Votes Cast
                  </div>
                  <div style={{ 
                    fontSize: '40px', 
                    fontWeight: '800',
                    color: '#16a34a',
                    lineHeight: '1'
                  }}>
                    {getTotalVotes()}
                  </div>
                </div>
                <div style={{
                  padding: '20px',
                  backgroundColor: '#eff6ff',
                  borderRadius: '12px',
                  border: '1px solid #bfdbfe'
                }}>
                  <div style={{ 
                    color: '#1e40af', 
                    fontSize: '13px', 
                    marginBottom: '12px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span style={{ fontSize: '18px' }}>👥</span>
                    Total Candidates
                  </div>
                  <div style={{ 
                    fontSize: '40px', 
                    fontWeight: '800',
                    color: '#2563eb',
                    lineHeight: '1'
                  }}>
                    {candidates.length}
                  </div>
                </div>
              </div>
            </div>

            {/* Results Summary */}
            {candidates.length === 0 ? (
              <div style={{
                backgroundColor: 'white',
                padding: '80px 40px',
                borderRadius: '16px',
                textAlign: 'center',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)'
              }}>
                <div style={{ fontSize: '80px', marginBottom: '24px', opacity: 0.3 }}>👥</div>
                <h3 style={{ 
                  fontSize: '24px', 
                  fontWeight: '700',
                  marginBottom: '12px',
                  color: '#1e293b'
                }}>
                  No Candidates
                </h3>
                <p style={{ 
                  fontSize: '16px',
                  color: '#64748b',
                  margin: 0
                }}>
                  No candidates have been approved for this election yet.
                </p>
              </div>
            ) : (
              <div style={{
                backgroundColor: 'white',
                padding: '32px',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)'
              }}>
                <h2 style={{ 
                  fontSize: '24px',
                  fontWeight: '700',
                  marginBottom: '32px',
                  color: '#1e293b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <span style={{ fontSize: '28px' }}>🏆</span>
                  Final Results
                </h2>

                {/* Phase 4 Result Banner */}
                {phase4Result 
                && (
                  <div style={{
                    padding: '20px 24px',
                    background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)',
                    borderRadius: '12px',
                    border: '1px solid #a78bfa',
                    marginBottom: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    flexWrap: 'wrap'
                  }
                  }>
                    {/* <span style={{ fontSize: '28px' }}>🔓</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: '#3730a3', marginBottom: '4px' }}>
                        Results Published via Threshold Decryption
                      </div>
                      <div style={{ fontSize: '13px', color: '#4338ca' }}>
                        Shares used: {phase4Result.shares_used?.length ?? '—'}
                        &nbsp;·&nbsp;Published: {phase4Result.published_at ? new Date(phase4Result.published_at).toLocaleString() : '—'}
                      </div>
                    </div> */}
                  </div>
                )}

                {/* Encrypted tally notice – shown while awaiting Phase 4 */}
                {!phase4Result && getElectionStatus() === 'Completed' && (
                  <div style={{
                    padding: '16px 20px',
                    backgroundColor: '#fef3c7',
                    borderRadius: '10px',
                    border: '1px solid #fcd34d',
                    marginBottom: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <span style={{ fontSize: '22px' }}>🔐</span>
                    <div style={{ fontSize: '14px', color: '#92400e' }}>
                      Votes are encrypted. Results will appear here after the organizer runs Phase 4 threshold decryption.
                    </div>
                  </div>
                )}

                {/* Winner Card — only shown after Phase 4 results published */}
                {phase4Result && getElectionStatus() === 'Completed' && candidates.length > 0 && (
                  <div style={{
                    background: 'linear-gradient(135deg, #fcd34d 0%, #f59e0b 100%)',
                    color: 'white',
                    padding: '32px',
                    borderRadius: '16px',
                    marginBottom: '32px',
                    boxShadow: '0 10px 25px -5px rgba(245, 158, 11, 0.3), 0 10px 10px -5px rgba(245, 158, 11, 0.2)',
                    border: '2px solid rgba(255,255,255,0.3)'
                  }}>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '24px', 
                      marginBottom: '24px', 
                      flexWrap: 'wrap' 
                    }}>
                      <span style={{ fontSize: '80px', lineHeight: '1' }}>🏆</span>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <div style={{ 
                          fontSize: '14px', 
                          fontWeight: '700',
                          opacity: 0.9, 
                          marginBottom: '8px',
                          letterSpacing: '0.1em'
                        }}>
                          ELECTION WINNER
                        </div>
                        <h2 style={{ 
                          fontSize: '36px', 
                          margin: '0 0 8px 0',
                          fontWeight: '800',
                          lineHeight: '1.2'
                        }}>
                          {candidates[0].name}
                        </h2>
                        <p style={{ 
                          margin: 0, 
                          fontSize: '18px', 
                          opacity: 0.95,
                          fontWeight: '600'
                        }}>
                          {candidates[0].party}
                        </p>
                      </div>
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '20px',
                      padding: '20px',
                      backgroundColor: 'rgba(255,255,255,0.2)',
                      borderRadius: '12px',
                      backdropFilter: 'blur(10px)'
                    }}>
                      <div>
                        <div style={{ 
                          fontSize: '14px', 
                          opacity: 0.9,
                          fontWeight: '600',
                          marginBottom: '8px'
                        }}>
                          Total Votes Cast
                        </div>
                        <div style={{ 
                          fontSize: '36px', 
                          fontWeight: '800',
                          lineHeight: '1'
                        }}>
                          {phase4Result.total_votes ?? totalVotes}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* All Candidates Results */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {candidates.map((candidate, index) => (
                    <div
                      key={candidate.address}
                      style={{
                        padding: '28px',
                        backgroundColor: candidate.rank === 1 && getElectionStatus() === 'Completed' 
                          ? '#fffbeb' 
                          : '#f8fafc',
                        borderRadius: '16px',
                        border: candidate.rank === 1 && getElectionStatus() === 'Completed' 
                          ? '2px solid #fbbf24' 
                          : '2px solid #e2e8f0',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = candidate.rank === 1 && getElectionStatus() === 'Completed' 
                          ? '#f59e0b' 
                          : '#cbd5e1';
                        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = candidate.rank === 1 && getElectionStatus() === 'Completed' 
                          ? '#fbbf24' 
                          : '#e2e8f0';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'start', 
                        marginBottom: '20px', 
                        gap: '16px', 
                        flexWrap: 'wrap' 
                      }}>
                        <div style={{ flex: 1, minWidth: '250px' }}>
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '12px', 
                            marginBottom: '12px', 
                            flexWrap: 'wrap' 
                          }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '18px',
                              fontWeight: '800',
                              padding: '8px 16px',
                              borderRadius: '10px',
                              minWidth: '52px',
                              background: candidate.rank === 1 
                                ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' 
                                : candidate.rank === 2
                                ? 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)'
                                : candidate.rank === 3
                                ? 'linear-gradient(135deg, #c2410c 0%, #9a3412 100%)'
                                : '#64748b',
                              color: 'white',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.15)'
                            }}>
                              #{candidate.rank}
                            </span>
                            <h3 style={{ 
                              margin: 0, 
                              fontSize: '24px',
                              fontWeight: '700',
                              color: '#1e293b'
                            }}>
                              {candidate.name}
                            </h3>
                            <span style={{
                              padding: '6px 14px',
                              backgroundColor: '#dbeafe',
                              borderRadius: '8px',
                              fontSize: '14px',
                              fontWeight: '600',
                              color: '#1e40af'
                            }}>
                              {candidate.party}
                            </span>
                          </div>
                          <p style={{ 
                            color: '#64748b', 
                            margin: 0, 
                            fontSize: '13px', 
                            fontFamily: 'monospace',
                            fontWeight: '500'
                          }}>
                            {candidate.address.substring(0, 20)}...{candidate.address.substring(candidate.address.length - 15)}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ 
                            fontSize: '48px', 
                            fontWeight: '800',
                            lineHeight: '1',
                            color: phase4Result ? '#1e293b' : '#94a3b8'
                          }}>
                            {phase4Result ? candidate.votes : '🔒'}
                          </div>
                          <div style={{ 
                            marginTop: '4px',
                            fontSize: '14px',
                            color: '#64748b',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                          }}>
                            {phase4Result ? 'votes' : 'encrypted'}
                          </div>
                        </div>
                      </div>

                      {/* Vote Percentage Bar */}
                      <div style={{ marginBottom: '20px' }}>
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '8px'
                        }}>
                          <span style={{
                            fontSize: '14px',
                            fontWeight: '600',
                            color: '#475569'
                          }}>
                            Vote Share
                          </span>
                          <span style={{
                            fontSize: '20px',
                            fontWeight: '800',
                            color: candidate.rank === 1 ? '#16a34a' : '#64748b'
                          }}>
                            {phase4Result ? `${candidate.percentage}%` : '— %'}
                          </span>
                        </div>
                        <div style={{
                          width: '100%',
                          height: '48px',
                          backgroundColor: '#e2e8f0',
                          borderRadius: '24px',
                          overflow: 'hidden',
                          position: 'relative',
                          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                        }}>
                          <div style={{
                            width: phase4Result ? `${candidate.percentage}%` : '0%',
                            height: '100%',
                            background: candidate.rank === 1 
                              ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)' 
                              : candidate.rank === 2 
                              ? 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)'
                              : 'linear-gradient(90deg, #64748b 0%, #475569 100%)',
                            transition: 'width 1s ease-out',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            paddingLeft: '20px',
                            color: 'white',
                            fontWeight: '800',
                            fontSize: '18px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                            borderRadius: '24px'
                          }}>
                            {phase4Result && candidate.percentage > 10 && `${candidate.percentage}%`}
                          </div>
                          {!phase4Result && (
                            <div style={{
                              position: 'absolute', inset: 0,
                              display: 'flex', alignItems: 'center', paddingLeft: '20px',
                              fontSize: '14px', fontWeight: '600', color: '#94a3b8'
                            }}>
                              🔒 Awaiting threshold decryption
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Manifesto */}
                      {candidate.manifesto && (
                        <div style={{
                          padding: '20px',
                          backgroundColor: 'white',
                          borderRadius: '12px',
                          border: '1px solid #e2e8f0'
                        }}>
                          <div style={{
                            fontSize: '13px',
                            fontWeight: '700',
                            color: '#64748b',
                            marginBottom: '12px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            <span style={{ fontSize: '16px' }}>📋</span>
                            Manifesto
                          </div>
                          <p style={{ 
                            color: '#334155', 
                            margin: 0, 
                            fontSize: '15px', 
                            lineHeight: '1.7'
                          }}>
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
