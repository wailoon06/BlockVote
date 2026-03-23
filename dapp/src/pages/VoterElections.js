import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getDeployedContract } from '../utils/contractUtils';
import { encryptVote, getPublicKey, getCandidateIndex, computeVoteBlock } from '../utils/voteEncryption';
import { generateVoteProof } from '../utils/zkpProofGenerator';
import { getVoterSecret, computeNullifier, toBytes32 } from '../utils/poseidonUtils';
import IPFSClient from '../utils/ipfsClient';
import MessageAlert from '../components/MessageAlert';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';

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

  // ── IC prompt for ZKP vote proof ──────────────────────────────────────────
  const [pendingVote, setPendingVote] = useState(null); // { electionId, candidateAddress }
  const [icInput, setIcInput] = useState('');

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

      // Load voter secret once — needed to derive per-election nullifiers
      const voterSecret = await getVoterSecret(address);

      for (let i = 1; i <= totalElections; i++) {
        const info = await contract.methods.getElectionInfo(i).call();
        const totalVotes = await contract.methods.getElectionTotalVotes(i).call();
        
        // Only show elections that are currently open for voting
        if (Number(info.startTime) <= now && now <= Number(info.endTime)) {
          // Derive nullifier for this election to check if voter has already voted
          let hasVoted = false;
          if (voterSecret) {
            try {
              const nullifierDecimal = await computeNullifier(voterSecret, i);
              const nullifierBytes32 = toBytes32(nullifierDecimal);
              hasVoted = await contract.methods.nullifierUsed(i, nullifierBytes32).call();
            } catch {
              hasVoted = false;
            }
          }
          // Get approved candidates
          const approvedCandidates = await contract.methods.getApprovedCandidates(i).call();
          const candidatesWithInfo = [];

          for (let candidateAddr of approvedCandidates) {
            const candidateInfo = await contract.methods.getCandidateInfo(candidateAddr).call();
            candidatesWithInfo.push({
              address: candidateAddr,
              name: candidateInfo.name,
              party: candidateInfo.party,
              manifesto: candidateInfo.manifesto,
              votes: 0  // Votes are encrypted; tallied after Phase 4 decryption
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

  const handleVote = async (electionId, candidateAddress, ic) => {
    if (voting) return;
    setVoting(electionId);
    setPendingVote(null);
    setIcInput('');

    const election = elections.find(e => e.id === electionId);
    if (!election) {
      setMessage('Election not found');
      setMessageType('danger');
      setVoting(null);
      return;
    }

    try {
      const { deployedContract, web3 } = await getDeployedContract();

      // ── Step 1: Encrypt ballot ───────────────────────────────────────
      setMessage('Preparing vote...');
      setMessageType('info');

      const publicKeyN = await getPublicKey(deployedContract);
      const totalVoters = await deployedContract.methods.getTotalRegisteredVoters().call();
      const voteBlock = computeVoteBlock(totalVoters);
      const candidateIndex = getCandidateIndex(election.candidates, candidateAddress);
      
      const numCandidates = election.candidates.length;
      const encryptedVoteData = await encryptVote(publicKeyN, candidateIndex, voteBlock, numCandidates);

      // ── Step 2: Upload encrypted ballot to IPFS ────────────────────────
      setMessage('Uploading vote...');

      const ipfsClient = new IPFSClient();
      if (!(await ipfsClient.isAvailable())) {
        throw new Error('IPFS Desktop is not running. Please start IPFS Desktop and try again.');
      }

      const votePackage = {
        election_id: electionId,
        encrypted_vote: encryptedVoteData.encrypted_vote,
        vote_block: encryptedVoteData.vote_block,
        encryption_method: encryptedVoteData.encryption_method,
        paillier_zkp: encryptedVoteData.paillier_zkp
      };
      const ipfsCID = await ipfsClient.uploadJSON(votePackage);
      await ipfsClient.pin(ipfsCID);

      // ── Step 3: Generate ZKP vote proof ──────────────────────────────
      setMessage('Generating ZK proof (may take ~30s)...');

      const voterSecret = await getVoterSecret(walletAddress);
      if (!voterSecret) {
        throw new Error('Voter secret not found. Please re-verify your identity first.');
      }

      const { pA, pB, pC, pubSignals, choiceCommitmentHex } = await generateVoteProof(
        ic, walletAddress, voterSecret, electionId,
        candidateIndex,              // NEW: 0-based index of chosen candidate
          election.candidates.length,  // NEW: total approved candidates
          ipfsCID                      // NEW: Mempool Front-Running mitigation
        );
      setMessage('Submitting...');

      await deployedContract.methods
        .vote(electionId, ipfsCID, pA, pB, pC, pubSignals)
        .send({ from: walletAddress, maxPriorityFeePerGas: web3.utils.toWei('30', 'gwei'), // Set above minimum 25 Gwei
          maxFeePerGas: web3.utils.toWei('45', 'gwei') });

      setMessage('✅ Vote cast successfully!');
      setMessageType('success');
      console.log('📊 Vote Summary — IPFS CID:', ipfsCID);

      await loadElections(deployedContract, walletAddress);

    } catch (error) {
      console.error('Error voting:', error);
      let errorMsg = 'Failed to cast vote';

      if (error.message.includes('IPFS Desktop is not running')) {
        errorMsg = 'IPFS Desktop is not running. Please start it and try again.';
      } else if (error.message.includes('IPFS')) {
        errorMsg = 'IPFS error. Make sure IPFS Desktop is running.';
      } else if (error.message.includes('Already voted') || error.message.includes('voted')) {
        errorMsg = 'You have already voted in this election';
      } else if (error.message.includes('!registered')) {
        errorMsg = 'Voter commitment not found on-chain. Please re-verify your identity.';
      } else if (error.message.includes('!proof')) {
        errorMsg = 'ZK proof verification failed. Check your IC number and try again.';
      } else if (error.message.includes('Voter secret not found')) {
        errorMsg = error.message;
      } else if (error.message.includes('Assert Failed')) {
        errorMsg = 'Proof generation failed: IC or age does not meet requirements.';
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
    <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #f8fafc 0%, #e2e8f0 100%)' }}>
      <Navbar 
        title="BlockVote - Active Elections"
        walletAddress={walletAddress}
        onLogout={handleLogout}
        userRole="voter"
        userStatus={voterInfo?.status}
      />
      <Sidebar userRole="voter" />

      {/* ── IC Confirmation Modal for ZKP Vote Proof ─────────────────────── */}
      {pendingVote && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: 'white', borderRadius: '16px', padding: '2rem',
            width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ margin: '0 0 0.5rem', color: '#1e293b' }}>🔐 Confirm Your Identity</h3>
            <p style={{ margin: '0 0 1.5rem', color: '#64748b', fontSize: '0.9rem' }}>
              Enter your IC number to generate a zero-knowledge proof. Your IC is never sent to the blockchain.
            </p>
            <input
              type="text"
              placeholder="e.g. 990101-01-1234"
              value={icInput}
              onChange={e => setIcInput(e.target.value)}
              style={{
                width: '100%', padding: '0.75rem 1rem', fontSize: '1rem',
                border: '1px solid #cbd5e1', borderRadius: '8px',
                outline: 'none', boxSizing: 'border-box', marginBottom: '1.25rem'
              }}
            />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => { setPendingVote(null); setIcInput(''); }}
                style={{
                  flex: 1, padding: '0.75rem', background: '#f1f5f9',
                  color: '#475569', border: '1px solid #cbd5e1',
                  borderRadius: '8px', fontWeight: '600', cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleVote(pendingVote.electionId, pendingVote.candidateAddress, icInput)}
                disabled={!icInput.trim()}
                style={{
                  flex: 2, padding: '0.75rem',
                  background: !icInput.trim() ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: 'white', border: 'none', borderRadius: '8px',
                  fontWeight: '600', cursor: !icInput.trim() ? 'not-allowed' : 'pointer'
                }}
              >
                🗳️ Confirm & Vote
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ 
        marginLeft: '70px',
        maxWidth: 'calc(1400px + 70px)',
        padding: '2.5rem 2rem',
        paddingTop: 'calc(70px + 2.5rem)'
      }}>
        {/* Header Section */}
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '2rem' }}>🗳️</span>
            <h1 style={{ 
              fontSize: '2rem', 
              margin: 0,
              color: '#1e293b',
              fontWeight: '700'
            }}>
              Active Elections
            </h1>
          </div>
          <p style={{ 
            fontSize: '1.05rem',
            color: '#64748b',
            margin: 0
          }}>
            Cast your vote in ongoing elections and make your voice heard
          </p>
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
            <div style={{ fontSize: '5rem', marginBottom: '1.5rem', opacity: 0.3 }}>🗳️</div>
            <h3 style={{ 
              fontSize: '1.5rem', 
              marginBottom: '0.75rem',
              color: '#1e293b',
              fontWeight: '600'
            }}>No Active Elections</h3>
            <p style={{ 
              fontSize: '1rem',
              color: '#64748b',
              margin: 0
            }}>
              There are currently no elections open for voting. Check back later!
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            {elections.map((election) => (
              <div
                key={election.id}
                style={{
                  background: 'white',
                  borderRadius: '16px',
                  padding: '2rem',
                  border: '1px solid #e2e8f0',
                  borderLeft: election.hasVoted ? '4px solid #10b981' : '4px solid #3b82f6',
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
                <div style={{ paddingBottom: '1.5rem', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '1.5rem', margin: 0, color: '#1e293b', fontWeight: '600' }}>
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
                      <p style={{ marginBottom: '0', color: '#64748b', fontSize: '0.95rem' }}>{election.description}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {election.hasVoted ? (
                        <span style={{ 
                          fontSize: '0.875rem', 
                          padding: '0.5rem 1rem',
                          background: '#dcfce7',
                          color: '#166534',
                          borderRadius: '8px',
                          fontWeight: '600',
                          border: '1px solid #bbf7d0',
                          display: 'inline-block'
                        }}>
                          ✓ Vote Cast
                        </span>
                      ) : (
                        <span style={{ 
                          fontSize: '0.875rem', 
                          padding: '0.5rem 1rem',
                          background: '#fef3c7',
                          color: '#92400e',
                          borderRadius: '8px',
                          fontWeight: '600',
                          border: '1px solid #fde68a',
                          display: 'inline-block'
                        }}>
                          ⏱️ {getVotingStatus(election)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ 
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                    marginTop: '1rem'
                  }}>
                    <div style={{ 
                      padding: '1rem', 
                      background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                      borderRadius: '12px',
                      border: '1px solid #bfdbfe'
                    }}>
                      <div style={{ 
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        color: '#1e40af',
                        marginBottom: '0.5rem'
                      }}>Ends At</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#475569' }}>{formatDateTime(election.endTime)}</div>
                    </div>
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
                      }}>Total Votes</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: '600', color: '#475569' }}>{election.totalVotes} votes cast</div>
                    </div>
                    <div style={{ 
                      padding: '1rem', 
                      background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                      borderRadius: '12px',
                      border: '1px solid #fcd34d'
                    }}>
                      <div style={{ 
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        color: '#92400e',
                        marginBottom: '0.5rem'
                      }}>🔐 Encryption</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: '500', color: '#475569' }}>Paillier Encrypted</div>
                    </div>
                  </div>
                </div>

                <div style={{ paddingTop: '1.5rem' }}>
                  <h4 style={{ fontSize: '1.125rem', marginBottom: '1.25rem', color: '#1e293b', fontWeight: '600' }}>
                    📋 Candidates ({election.candidates.length})
                  </h4>
                  
                  {election.candidates.length === 0 ? (
                    <div style={{
                      padding: '1rem 1.25rem',
                      background: '#dbeafe',
                      border: '1px solid #bfdbfe',
                      borderRadius: '12px',
                      color: '#1e40af',
                      fontSize: '0.95rem',
                      fontWeight: '500'
                    }}>
                      No approved candidates for this election yet.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                      {election.candidates.map((candidate) => (
                        <div
                          key={candidate.address}
                          style={{
                            padding: '1.5rem',
                            background: 'linear-gradient(135deg, #fafbfc 0%, #f8fafc 100%)',
                            border: election.hasVoted ? '2px solid #10b981' : '2px solid #e2e8f0',
                            borderRadius: '12px',
                            transition: 'all 0.3s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (!election.hasVoted) {
                              e.currentTarget.style.borderColor = '#3b82f6';
                              e.currentTarget.style.background = 'white';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!election.hasVoted) {
                              e.currentTarget.style.borderColor = '#e2e8f0';
                              e.currentTarget.style.background = 'linear-gradient(135deg, #fafbfc 0%, #f8fafc 100%)';
                            }
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1.5rem', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '1.75rem' }}>👨‍💼</span>
                                <h5 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                                  {candidate.name}
                                </h5>
                                {candidate.party && (
                                  <span style={{
                                    padding: '0.375rem 0.875rem',
                                    fontSize: '0.875rem',
                                    fontWeight: '500',
                                    borderRadius: '8px',
                                    background: '#dbeafe',
                                    color: '#1e40af',
                                    border: '1px solid #bfdbfe'
                                  }}>
                                    {candidate.party}
                                  </span>
                                )}
                              </div>
                              {candidate.manifesto && (
                                <div style={{ padding: '1rem', background: 'white', borderRadius: '8px', marginTop: '0.75rem', border: '1px solid #e2e8f0' }}>
                                  <div style={{ 
                                    fontSize: '0.875rem',
                                    fontWeight: '600',
                                    color: '#64748b',
                                    marginBottom: '0.5rem'
                                  }}>Manifesto</div>
                                  <p style={{ color: '#475569', fontSize: '0.95rem', margin: 0, lineHeight: '1.6' }}>
                                    {candidate.manifesto}
                                  </p>
                                </div>
                              )}
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                              {election.hasVoted ? (
                                <span style={{ 
                                  padding: '0.75rem 1.25rem', 
                                  fontSize: '0.95rem',
                                  background: '#dcfce7',
                                  color: '#166534',
                                  borderRadius: '8px',
                                  fontWeight: '600',
                                  border: '1px solid #bbf7d0'
                                }}>
                                  ✓ Voted
                                </span>
                              ) : (
                                <button
                                  onClick={() => setPendingVote({ electionId: election.id, candidateAddress: candidate.address })}
                                  disabled={voting === election.id}
                                  style={{
                                    padding: '0.75rem 1.5rem',
                                    background: voting === election.id ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '12px',
                                    fontSize: '0.95rem',
                                    fontWeight: '600',
                                    cursor: voting === election.id ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.3s ease',
                                    boxShadow: voting === election.id ? 'none' : '0 2px 8px rgba(59, 130, 246, 0.3)',
                                    whiteSpace: 'nowrap'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (voting !== election.id) {
                                      e.currentTarget.style.transform = 'translateY(-2px)';
                                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (voting !== election.id) {
                                      e.currentTarget.style.transform = 'translateY(0)';
                                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.3)';
                                    }
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
