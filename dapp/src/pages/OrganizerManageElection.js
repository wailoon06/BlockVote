import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getDeployedContract } from '../utils/contractUtils';
import MessageAlert from '../components/MessageAlert';
import Navbar from '../components/Navbar';
import IPFSClient from '../utils/ipfsClient';
import { performHomomorphicAddition } from '../utils/homomorphicAggregator';
import { extractVoteCounts, decryptShareY, thresholdDecrypt } from '../utils/thresholdDecryption';
import { computeVoteBlock } from '../utils/voteEncryption';

export default function OrganizerManageElection() {
  const navigate = useNavigate();
  const location = useLocation();
  const electionId = location.state?.electionId != null ? Number(location.state.electionId) : undefined;
  
  const [walletAddress, setWalletAddress] = useState('');
  const [election, setElection] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [applicantDetails, setApplicantDetails] = useState({});
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [aggregating, setAggregating] = useState(false);
  const [tallyStatus, setTallyStatus] = useState(null);
  const [decrypting, setDecrypting] = useState(false);
  const [phase4Status, setPhase4Status] = useState(null);
  // Off-chain decryption: share files loaded by organizer
  const [uploadedShares, setUploadedShares] = useState([]); // [{data, passphrase, fileName}]

  useEffect(() => {
    if (!electionId) {
      setMessage('No election ID provided');
      setMessageType('danger');
      setTimeout(() => navigate('/organizer-dashboard'), 2000);
      return;
    }
    initialize();
  }, [electionId]);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage('');
        setMessageType('');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  // Auto-run Phase 3 aggregation when voting period ends
  useEffect(() => {
    if (!election || !tallyStatus || aggregating || tallyStatus.tallyStored) return;
    if (Math.floor(Date.now() / 1000) > election.endTime) {
      handleAggregateVotes();
    }
  }, [election, tallyStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const initialize = async () => {
    try {
      if (typeof window.ethereum !== 'undefined') {
        const accounts = await window.ethereum.request({
          method: 'eth_requestAccounts',
        });

        if (accounts.length > 0) {
          const address = accounts[0];
          setWalletAddress(address);

          const { deployedContract } = await getDeployedContract();

          // Only approved organizers can access this page
          const isApproved = await deployedContract.methods.isOrganizer(address).call();
          if (!isApproved) {
            setMessage('Only approved organizers can access this page');
            setMessageType('danger');
            setTimeout(() => navigate('/organizer-dashboard'), 2000);
            return;
          }

          // Load election info
          const info = await deployedContract.methods.getElectionInfo(electionId).call();

          if (info.organizer.toLowerCase() !== address.toLowerCase()) {
            setMessage('You can only manage your own elections');
            setMessageType('danger');
            setTimeout(() => navigate('/organizer-dashboard'), 2000);
            return;
          }

          setElection({
            id: electionId,
            title: info.title,
            description: info.description,
            nominationStartTime: Number(info.nominationStartTime),
            nominationEndTime: Number(info.nominationEndTime),
            startTime: Number(info.startTime),
            endTime: Number(info.endTime),
            organizer: info.organizer
          });

          await loadApplicants(deployedContract);
          await loadTallyStatus(deployedContract);
          await loadPhase4Status(deployedContract);
        }
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

  const loadApplicants = async (contract) => {
    try {
      const applicantsList = await contract.methods.getElectionCandidateApplicants(electionId).call();
      setApplicants(applicantsList);

      // Load details for each applicant
      const details = {};
      for (const address of applicantsList) {
        const candidateInfo = await contract.methods.getCandidateInfo(address).call();
        const status = await contract.methods.candidateApplicationStatus(electionId, address).call();
        
        details[address] = {
          name: candidateInfo.name,
          email: candidateInfo.email,
          party: candidateInfo.party,
          manifesto: candidateInfo.manifesto,
          status: Number(status)
        };
      }
      setApplicantDetails(details);
    } catch (error) {
      console.error('Error loading applicants:', error);
      setMessage('Failed to load applicants: ' + error.message);
      setMessageType('danger');
    }
  };

  const handleApprove = async (candidateAddress) => {
    if (!walletAddress) return;

    setProcessing(candidateAddress);
    setMessage('Approving candidate...');
    setMessageType('info');

    try {
      const { deployedContract } = await getDeployedContract();
      
      await deployedContract.methods
        .approveCandidateForElection(electionId, candidateAddress)
        .send({ from: walletAddress });

      setMessage('Candidate approved successfully!');
      setMessageType('success');
      
      // Reload applicants
      await loadApplicants(deployedContract);
    } catch (error) {
      console.error('Error approving:', error);
      setMessage('Failed to approve: ' + error.message);
      setMessageType('danger');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (candidateAddress) => {
    if (!walletAddress) return;

    setProcessing(candidateAddress);
    setMessage('Rejecting candidate...');
    setMessageType('info');

    try {
      const { deployedContract } = await getDeployedContract();
      
      await deployedContract.methods
        .rejectCandidateForElection(electionId, candidateAddress)
        .send({ from: walletAddress });

      setMessage('Candidate rejected');
      setMessageType('success');
      
      // Reload applicants
      await loadApplicants(deployedContract);
    } catch (error) {
      console.error('Error rejecting:', error);
      setMessage('Failed to reject: ' + error.message);
      setMessageType('danger');
    } finally {
      setProcessing(null);
    }
  };

  const loadTallyStatus = async (contract) => {
    try {
      const tally = await contract.methods.getEncryptedTally(electionId).call();
      setTallyStatus({
        encryptedTally: tally.encryptedTally,
        totalVotes: Number(tally.totalVotes),
        tallyStored: tally.tallyStored
      });
    } catch (error) {
      console.error('Error loading tally:', error);
    }
  };

  const loadPhase4Status = async (contract) => {
    try {
      const res = await contract.methods.getResults(electionId).call();
      setPhase4Status({
        decryptedResult: res.decryptedResult,
        resultsPublished: res.resultsPublished,
        shareCount: Number(res.shareCount)
      });
    } catch (error) {
      // getResults may fail if election doesn't exist yet – ignore silently
      console.log('Phase 4 status not available yet:', error.message);
    }
  };

  // ── Add a trustee share file to the collection ──────────────────────────
  const handleAddShareFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (typeof json.x === 'undefined') throw new Error('Missing x field');
      if (typeof json.y === 'undefined' && typeof json.encrypted_y === 'undefined')
        throw new Error('Missing y / encrypted_y field');
      if (uploadedShares.some(s => s.data.x === json.x))
        throw new Error(`Share x=${json.x} is already loaded.`);
      setUploadedShares(prev => [...prev, { data: json, passphrase: '', fileName: file.name }]);
      setMessage(`Share x=${json.x} loaded`);
      setMessageType('info');
    } catch (err) {
      setMessage(`Failed to load share: ${err.message}`);
      setMessageType('danger');
    }
    e.target.value = '';
  };

  // ── Organizer: reconstruct λ from shares off-chain, decrypt, publish ─────
  const handleDecryptAndPublish = async () => {
    if (decrypting) return;
    setDecrypting(true);
    setMessage('Reconstructing private key and decrypting...');
    setMessageType('info');
    try {
      const { deployedContract } = await getDeployedContract();

      const thresholdBN = await deployedContract.methods.threshold().call();
      const required = Number(thresholdBN);
      if (uploadedShares.length < required)
        throw new Error(`Need at least ${required} share files. Currently have ${uploadedShares.length}.`);

      // Decrypt each share's y value (AES or plaintext)
      const shares = [];
      for (let i = 0; i < uploadedShares.length; i++) {
        const { data, passphrase } = uploadedShares[i];
        let y;
        if (data.encrypted_y) {
          if (!passphrase?.trim())
            throw new Error(`Passphrase required for share x=${data.x}.`);
          y = await decryptShareY(data.encrypted_y, passphrase);
        } else {
          y = String(data.y);
        }
        shares.push({ x: data.x, y, prime: data.prime });
      }

      const publicKeyN = await deployedContract.methods.getPaillierPublicKey().call();
      const tallyData  = await deployedContract.methods.getEncryptedTally(electionId).call();
      let encryptedTally, storedVoteBlock;
      try {
        const obj = JSON.parse(tallyData.encryptedTally);
        encryptedTally  = obj.encrypted_total;
        storedVoteBlock = obj.vote_block;
      } catch {
        encryptedTally  = tallyData.encryptedTally;
      }
      if (!encryptedTally) throw new Error('Encrypted tally not on blockchain.');

      // Reconstruct λ via Shamir and decrypt with standard Paillier.
      // λ is scoped inside thresholdDecrypt – never returned or stored.
      const { plaintext } = thresholdDecrypt(encryptedTally, shares, publicKeyN);

      // Zero out plaintext y values from memory immediately after use
      shares.forEach(s => { s.y = null; });

      setMessage('Publishing results...');
      const approvedCandidates = await deployedContract.methods.getApprovedCandidates(electionId).call();
      const voteBlock = storedVoteBlock
        ? BigInt(storedVoteBlock)
        : computeVoteBlock(await deployedContract.methods.getTotalRegisteredVoters().call());

      const perCandidateVotes = extractVoteCounts(plaintext, approvedCandidates.length, voteBlock);

      const bigIntReplacer = (_, v) => typeof v === 'bigint' ? v.toString() : v;
      const resultPayload = JSON.stringify({
        election_id:         electionId,
        decrypted_total:     plaintext.toString(),
        total_votes:         tallyStatus.totalVotes,
        per_candidate_votes: perCandidateVotes,
        candidates:          approvedCandidates,
        method:              'Threshold Shamir + Paillier (off-chain)',
        shares_used:         shares.map(s => ({ x: s.x })),
        published_at:        new Date().toISOString()
      }, bigIntReplacer);

      await deployedContract.methods
        .publishResults(electionId, resultPayload)
        .send({ from: walletAddress });

      setMessage('✅ Results published successfully!');
      setMessageType('success');
      // Clear shares (including passphrases) from state after successful publish
      setUploadedShares([]);
      await loadTallyStatus(deployedContract);
      await loadPhase4Status(deployedContract);
    } catch (err) {
      // Sanitise error messages – never expose raw crypto values
      const safeMsg = err.message?.replace(/\d{50,}/g, '[redacted]') || 'Failed to decrypt and publish';
      setMessage(safeMsg);
      setMessageType('danger');
    } finally {
      setDecrypting(false);
    }
  };

  const handleAggregateVotes = async () => {
    if (aggregating) return;
    
    setAggregating(true);
    setMessage('Tallying votes...');
    setMessageType('info');

    try {
      const { web3, deployedContract } = await getDeployedContract();

      // Step 1: Check if election has ended
      const now = Math.floor(Date.now() / 1000);
      if (now <= election.endTime) {
        throw new Error('Election has not ended yet. Please wait until voting period is over.');
      }

      // Step 2: Retrieve public key from blockchain
      setMessage('Fetching key...');
      const publicKeyN = await deployedContract.methods.getPaillierPublicKey().call();
      const isPaillierKeySet = await deployedContract.methods.isPaillierKeySet().call();

      if (!isPaillierKeySet) {
        throw new Error('Encryption key not set. Run Phase 1 setup first.');
      }

      console.log('✅ Public key retrieved:', publicKeyN.substring(0, 50) + '...');

      // Step 3: Fetch all votes from blockchain (anonymous ZKP votes keyed by nullifier)
      setMessage('Fetching votes...');
      const nullifiers = await deployedContract.methods.getZKPVoteNullifiers(electionId).call();

      if (nullifiers.length === 0) {
        throw new Error('No votes found for this election');
      }

      console.log(`Found ${nullifiers.length} encrypted votes`);

      // Step 4: Retrieve full ciphertexts from IPFS
      setMessage(`Retrieving ${nullifiers.length} votes from IPFS...`);
      
      const ipfsClient = new IPFSClient();
      const isIPFSAvailable = await ipfsClient.isAvailable();
      
      if (!isIPFSAvailable) {
        throw new Error('IPFS Desktop is not running. Please start it and try again.');
      }

      const ciphertexts = [];
      const orderedCIDs = [];   // CIDs in nullifier order — needed for tallyInputHash
      let voteBlockFromIPFS = null;
      
      for (let i = 0; i < nullifiers.length; i++) {
        const nullifier = nullifiers[i];
        const ipfsCID = await deployedContract.methods.getZKPVote(electionId, nullifier).call();
        
        if (!ipfsCID) {
          console.warn(`Vote not found for nullifier ${nullifier}, skipping...`);
          continue;
        }
        orderedCIDs.push(ipfsCID);
        
        try {
          const votePackage = await ipfsClient.retrieveJSON(ipfsCID);
          const ct = votePackage.encrypted_vote ?? votePackage.ciphertext;
          if (!ct) throw new Error(`Vote package missing encrypted_vote field (CID: ${ipfsCID})`);
          ciphertexts.push(ct);
          // Capture vote_block from first valid package — all votes must use the same B
          if (voteBlockFromIPFS === null && votePackage.vote_block) {
            voteBlockFromIPFS = String(votePackage.vote_block);
          }
          console.log(`Retrieved vote ${i + 1}/${nullifiers.length} from IPFS`);
        } catch (ipfsError) {
          console.error(`Failed to retrieve vote from IPFS (${ipfsCID}):`, ipfsError);
          throw new Error(`Failed to retrieve vote ${i + 1} from IPFS: ${ipfsError.message}`);
        }
      }

      if (ciphertexts.length === 0) {
        throw new Error('No valid ciphertexts retrieved from IPFS');
      }

      console.log(`✅ Retrieved ${ciphertexts.length} ciphertexts from IPFS`);

      // Step 5: Perform homomorphic addition
      setMessage(`Aggregating ${ciphertexts.length} votes...`);
      
      const encryptedTotal = performHomomorphicAddition(publicKeyN, ciphertexts);
      
      console.log('✅ Homomorphic aggregation complete');
      console.log('Encrypted total:', encryptedTotal.substring(0, 50) + '...');

      // Determine num_candidates for the extraction step at Phase 4
      const candidateAddrs = await deployedContract.methods.getApprovedCandidates(electionId).call();

      // Store tally as JSON so Phase 4 can use the exact same vote_block that
      // was used at encryption time rather than re-deriving it from the
      // (ever-growing) getTotalRegisteredVoters() global counter.
      const tallyPayload = JSON.stringify({
        encrypted_total: encryptedTotal,
        vote_block: voteBlockFromIPFS || computeVoteBlock(
          await deployedContract.methods.getTotalRegisteredVoters().call()
        ).toString(),
        num_candidates: candidateAddrs.length
      });

      // Step 6: Store encrypted tally on blockchain
      setMessage('Storing tally on blockchain...');

      // Compute tallyInputHash = keccak256(abi.encodePacked(cid_0, cid_1, ...)) in nullifier order
      // This must match the on-chain verification in storeEncryptedTally()
      const tallyInputHash = web3.utils.soliditySha3(
        ...orderedCIDs.map(cid => ({ t: 'string', v: cid }))
      );
      
      await deployedContract.methods
        .storeEncryptedTally(electionId, tallyPayload, tallyInputHash)
        .send({ from: walletAddress });

      setMessage(`✅ Votes tallied (${ciphertexts.length} total).`);
      setMessageType('success');

      console.log('📊 Aggregation Summary:');
      console.log('  Vote Count:', ciphertexts.length);
      console.log('  Encrypted Total:', encryptedTotal);

      // Reload tally status
      await loadTallyStatus(deployedContract);

    } catch (error) {
      console.error('Aggregation error:', error);
      let errorMsg = 'Failed to aggregate votes';
      
      if (error.message.includes('not ended yet')) {
        errorMsg = 'Election has not ended yet';
      } else if (error.message.includes('IPFS')) {
        errorMsg = `IPFS Error: ${error.message}`;
      } else if (error.message.includes('Tally already stored')) {
        errorMsg = 'Votes have already been aggregated for this election';
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      setMessage(errorMsg);
      setMessageType('danger');
    } finally {
      setAggregating(false);
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 0: return 'Not Applied';
      case 1: return 'Pending Review';
      case 2: return 'Approved';
      case 3: return 'Rejected';
      default: return 'Unknown';
    }
  };

  const getStatusStyle = (status) => {
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
      default: return { ...baseStyle, backgroundColor: '#e9ecef', color: '#6c757d' };
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
    setWalletAddress('');
    setElection(null);
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
            Loading election details...
          </div>
        </div>
      </div>
    );
  }

  const pendingCount = Object.values(applicantDetails).filter(d => d.status === 1).length;
  const approvedCount = Object.values(applicantDetails).filter(d => d.status === 2).length;
  const rejectedCount = Object.values(applicantDetails).filter(d => d.status === 3).length;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Navbar 
        title="BlockVote - Manage Election Candidates"
        walletAddress={walletAddress}
        onLogout={handleLogout}
        userRole="organizer"
      />

      <div style={{ 
        maxWidth: '1400px', 
        margin: '0 auto', 
        padding: '40px 30px', 
        paddingTop: 'calc(70px + 40px)' 
      }}>
        <button
          onClick={() => navigate('/organizer-dashboard')}
          style={{
            padding: '12px 20px',
            backgroundColor: 'white',
            color: '#1e293b',
            border: '2px solid #e2e8f0',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '15px',
            marginBottom: '32px',
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
          Back to Dashboard
        </button>

        {election && (
          <>
            <div style={{ marginBottom: '40px' }}>
              <h1 style={{ 
                fontSize: '32px', 
                fontWeight: '800', 
                marginBottom: '12px', 
                color: '#1e293b',
                letterSpacing: '-0.02em'
              }}>
                {election.title}
              </h1>
              <p style={{ 
                color: '#64748b', 
                fontSize: '16px', 
                marginBottom: '24px',
                lineHeight: '1.6'
              }}>
                {election.description}
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '20px',
                padding: '24px',
                backgroundColor: 'white',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
              }}>
                <div>
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#64748b', 
                    fontSize: '13px', 
                    marginBottom: '8px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    <span style={{ fontSize: '18px' }}>📝</span>
                    Nomination Period
                  </div>
                  <div style={{ 
                    fontSize: '15px', 
                    color: '#1e293b',
                    marginLeft: '26px'
                  }}>
                    <div style={{ marginBottom: '4px' }}>
                      <strong style={{ fontWeight: '600' }}>Start:</strong>{' '}
                      {formatDateTime(election.nominationStartTime)}
                    </div>
                    <div>
                      <strong style={{ fontWeight: '600' }}>End:</strong>{' '}
                      {formatDateTime(election.nominationEndTime)}
                    </div>
                  </div>
                </div>
                <div>
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#64748b', 
                    fontSize: '13px', 
                    marginBottom: '8px',
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    <span style={{ fontSize: '18px' }}>🗳️</span>
                    Voting Period
                  </div>
                  <div style={{ 
                    fontSize: '15px', 
                    color: '#1e293b',
                    marginLeft: '26px'
                  }}>
                    <div style={{ marginBottom: '4px' }}>
                      <strong style={{ fontWeight: '600' }}>Start:</strong>{' '}
                      {formatDateTime(election.startTime)}
                    </div>
                    <div>
                      <strong style={{ fontWeight: '600' }}>End:</strong>{' '}
                      {formatDateTime(election.endTime)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <MessageAlert message={message} type={messageType} onClose={() => setMessage('')} />

            {/* Enhanced Statistics Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '24px',
              marginBottom: '40px'
            }}>
              <div style={{
                backgroundColor: 'white',
                padding: '28px',
                borderRadius: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)',
                border: '1px solid #e2e8f0',
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)';
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <div style={{ 
                      color: '#64748b', 
                      fontSize: '13px', 
                      marginBottom: '12px',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Total Applications
                    </div>
                    <div style={{ 
                      fontSize: '40px', 
                      fontWeight: '800', 
                      color: '#1e293b',
                      lineHeight: '1'
                    }}>
                      {applicants.length}
                    </div>
                  </div>
                  <div style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '12px',
                    backgroundColor: '#eff6ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '26px'
                  }}>
                    📋
                  </div>
                </div>
              </div>

              <div style={{
                backgroundColor: 'white',
                padding: '28px',
                borderRadius: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)',
                border: '1px solid #e2e8f0',
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)';
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <div style={{ 
                      color: '#64748b', 
                      fontSize: '13px', 
                      marginBottom: '12px',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Pending Review
                    </div>
                    <div style={{ 
                      fontSize: '40px', 
                      fontWeight: '800', 
                      color: '#eab308',
                      lineHeight: '1'
                    }}>
                      {pendingCount}
                    </div>
                  </div>
                  <div style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '12px',
                    backgroundColor: '#fefce8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '26px'
                  }}>
                    ⏳
                  </div>
                </div>
              </div>

              <div style={{
                backgroundColor: 'white',
                padding: '28px',
                borderRadius: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)',
                border: '1px solid #e2e8f0',
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)';
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <div style={{ 
                      color: '#64748b', 
                      fontSize: '13px', 
                      marginBottom: '12px',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Approved
                    </div>
                    <div style={{ 
                      fontSize: '40px', 
                      fontWeight: '800', 
                      color: '#16a34a',
                      lineHeight: '1'
                    }}>
                      {approvedCount}
                    </div>
                  </div>
                  <div style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '12px',
                    backgroundColor: '#f0fdf4',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '26px'
                  }}>
                    ✅
                  </div>
                </div>
              </div>

              <div style={{
                backgroundColor: 'white',
                padding: '28px',
                borderRadius: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)',
                border: '1px solid #e2e8f0',
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)';
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <div style={{ 
                      color: '#64748b', 
                      fontSize: '13px', 
                      marginBottom: '12px',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      Rejected
                    </div>
                    <div style={{ 
                      fontSize: '40px', 
                      fontWeight: '800', 
                      color: '#dc2626',
                      lineHeight: '1'
                    }}>
                      {rejectedCount}
                    </div>
                  </div>
                  <div style={{
                    width: '52px',
                    height: '52px',
                    borderRadius: '12px',
                    backgroundColor: '#fef2f2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '26px'
                  }}>
                    ❌
                  </div>
                </div>
              </div>
            </div>

            {/* Vote Tallying & Results Section */}
            {election && (
              <div style={{
                backgroundColor: 'white',
                borderRadius: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)',
                padding: '32px',
                marginBottom: '40px',
                border: phase4Status?.resultsPublished
                  ? '2px solid #6366f1'
                  : tallyStatus?.tallyStored
                  ? '2px solid #f59e0b'
                  : '1px solid #e2e8f0'
              }}>
                <div style={{ marginBottom: '24px' }}>
                  <h2 style={{ color: '#1e293b', fontSize: '24px', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '28px' }}>📊</span>
                    Vote Tallying &amp; Results
                  </h2>
                  <p style={{ color: '#64748b', fontSize: '15px', margin: 0 }}>
                    Collect share files from trustees (offline), reconstruct the private key, then publish the decrypted results.
                  </p>
                </div>

                {phase4Status?.resultsPublished ? (
                  /* ── Results already published ── */
                  <div style={{ padding: '24px', background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)', borderRadius: '12px', border: '1px solid #a78bfa' }}>
                    <div style={{ display: 'flex', alignItems: 'start', gap: '16px', marginBottom: '20px' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '12px', backgroundColor: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>🏆</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#3730a3', marginBottom: '8px' }}>Results Published on Blockchain!</div>
                        <div style={{ fontSize: '14px', color: '#4338ca', lineHeight: '1.6' }}>The decrypted tally has been permanently recorded. Individual votes remain encrypted and private.</div>
                      </div>
                    </div>
                    {(() => {
                      try {
                        const parsed = JSON.parse(phase4Status.decryptedResult);
                        return (
                          <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '8px' }}>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Decrypted Result</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                              <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Decrypted Total</div>
                                <div style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b', fontFamily: 'monospace' }}>{parsed.decrypted_total}</div>
                              </div>
                              <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Total Votes</div>
                                <div style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b' }}>{parsed.total_votes}</div>
                              </div>
                              <div style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Shares Used</div>
                                <div style={{ fontSize: '20px', fontWeight: '700', color: '#1e293b' }}>{parsed.shares_used?.length ?? phase4Status.shareCount}</div>
                              </div>
                            </div>
                            <div style={{ marginTop: '12px', fontSize: '12px', color: '#94a3b8' }}>
                              Published: {parsed.published_at ? new Date(parsed.published_at).toLocaleString() : '—'}
                            </div>
                          </div>
                        );
                      } catch {
                        return (
                          <div style={{ backgroundColor: 'white', padding: '16px', borderRadius: '8px' }}>
                            <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#1e293b', wordBreak: 'break-all' }}>{phase4Status.decryptedResult}</div>
                          </div>
                        );
                      }
                    })()}
                  </div>
                ) : (
                  <div>
                    {/* Step pipeline */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>

                      {/* Step 1: Voting period */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', borderRadius: '10px', backgroundColor: election && Math.floor(Date.now()/1000) > election.endTime ? '#d1fae5' : '#fef3c7', border: `1px solid ${election && Math.floor(Date.now()/1000) > election.endTime ? '#6ee7b7' : '#fcd34d'}` }}>
                        <span style={{ fontSize: '22px' }}>{election && Math.floor(Date.now()/1000) > election.endTime ? '✅' : '⏳'}</span>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>Step 1 — Voting Period</div>
                          <div style={{ fontSize: '13px', color: '#64748b' }}>
                            {election && Math.floor(Date.now()/1000) > election.endTime ? 'Voting closed' : `Active until ${election ? formatDateTime(election.endTime) : '...'}`}
                          </div>
                        </div>
                      </div>

                      {/* Step 2: Homomorphic aggregation */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', borderRadius: '10px', backgroundColor: tallyStatus?.tallyStored ? '#d1fae5' : aggregating ? '#dbeafe' : '#f1f5f9', border: `1px solid ${tallyStatus?.tallyStored ? '#6ee7b7' : aggregating ? '#93c5fd' : '#e2e8f0'}` }}>
                        <span style={{ fontSize: '22px' }}>{tallyStatus?.tallyStored ? '✅' : aggregating ? '⚙️' : '○'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>Step 2 — Homomorphic Aggregation</div>
                          <div style={{ fontSize: '13px', color: '#64748b' }}>
                            {tallyStatus?.tallyStored ? `${tallyStatus.totalVotes} votes aggregated — encrypted tally on blockchain` : aggregating ? 'Aggregating encrypted votes...' : 'Runs automatically when voting ends'}
                          </div>
                        </div>
                        {aggregating && <div style={{ width: '18px', height: '18px', border: '3px solid #93c5fd', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
                      </div>

                      {/* Step 3: Collect shares & decrypt */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', borderRadius: '10px', backgroundColor: decrypting ? '#ede9fe' : '#f1f5f9', border: `1px solid ${decrypting ? '#a78bfa' : '#e2e8f0'}` }}>
                        <span style={{ fontSize: '22px' }}>{decrypting ? '⚙️' : '○'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>Step 3 — Collect Shares &amp; Decrypt</div>
                          <div style={{ fontSize: '13px', color: '#64748b' }}>
                            {decrypting ? 'Reconstructing private key and decrypting...' : tallyStatus?.tallyStored ? 'Upload trustee share files below to decrypt the tally' : 'Waiting for aggregation'}
                          </div>
                        </div>
                        {decrypting && <div style={{ width: '18px', height: '18px', border: '3px solid #a78bfa', borderTop: '3px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
                      </div>
                    </div>

                    {/* ── SHARE COLLECTION PANEL ── */}
                    {tallyStatus?.tallyStored && (
                      <div style={{ padding: '20px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span>🔑</span> Collect Trustee Shares &amp; Decrypt Results
                        </div>
                        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px', lineHeight: '1.6' }}>
                          Obtain share files (<code>trustee_shares/trustee_N.json</code>) from trustees. Upload at least the threshold number, enter passphrases if required, then click Decrypt &amp; Publish.
                        </div>

                        {/* Loaded shares */}
                        {uploadedShares.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                            {uploadedShares.map((s, idx) => (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', backgroundColor: 'white', border: '1px solid #d1fae5', borderRadius: '8px' }}>
                                <span style={{ fontSize: '18px' }}>📄</span>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#166534' }}>Share x={s.data.x} — {s.fileName}</div>
                                  {s.data.encrypted_y && (
                                    <input
                                      type="password"
                                      placeholder="Enter passphrase"
                                      value={s.passphrase}
                                      onChange={e => setUploadedShares(prev => prev.map((item, i) => i === idx ? { ...item, passphrase: e.target.value } : item))}
                                      style={{ marginTop: '6px', width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                  )}
                                </div>
                                <button onClick={() => setUploadedShares(prev => prev.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '18px', lineHeight: 1 }}>✕</button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add share file */}
                        <label style={{ display: 'block', padding: '12px 16px', backgroundColor: 'white', border: '2px dashed #cbd5e1', borderRadius: '8px', cursor: 'pointer', textAlign: 'center', fontSize: '14px', color: '#475569', marginBottom: '12px' }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = '#94a3b8'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = '#cbd5e1'}>
                          ➕ Add trustee share file (JSON)
                          <input type="file" accept=".json" onChange={handleAddShareFile} key={uploadedShares.length} style={{ display: 'none' }} />
                        </label>

                        <button
                          onClick={handleDecryptAndPublish}
                          disabled={decrypting || uploadedShares.length === 0}
                          style={{ width: '100%', padding: '12px', backgroundColor: (decrypting || uploadedShares.length === 0) ? '#e2e8f0' : '#6366f1', color: (decrypting || uploadedShares.length === 0) ? '#94a3b8' : 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '700', cursor: (decrypting || uploadedShares.length === 0) ? 'not-allowed' : 'pointer' }}
                        >
                          {decrypting ? '⚙️ Decrypting...' : '🔓 Decrypt & Publish Results'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Applicants List */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.02)',
              padding: '32px',
              border: '1px solid #e2e8f0'
            }}>
              <h2 style={{ 
                color: '#1e293b', 
                fontSize: '24px', 
                fontWeight: '700',
                marginBottom: '28px'
              }}>
                Candidate Applications
              </h2>

              {applicants.length === 0 ? (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '60px 20px', 
                  color: '#64748b' 
                }}>
                  <div style={{ fontSize: '64px', marginBottom: '16px' }}>📭</div>
                  <h3 style={{ 
                    marginBottom: '8px',
                    fontSize: '20px',
                    fontWeight: '600',
                    color: '#475569'
                  }}>
                    No Applications Yet
                  </h3>
                  <p style={{ margin: 0, fontSize: '16px' }}>
                    Candidates can apply during the nomination period.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: '24px' }}>
                  {applicants.map((address) => {
                    const details = applicantDetails[address];
                    if (!details) return null;

                    return (
                      <div
                        key={address}
                        style={{
                          padding: '24px',
                          backgroundColor: '#f8fafc',
                          borderRadius: '12px',
                          border: '2px solid #e2e8f0',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#cbd5e1';
                          e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = '#e2e8f0';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'start', 
                          marginBottom: '16px',
                          flexWrap: 'wrap',
                          gap: '12px'
                        }}>
                          <div style={{ flex: 1, minWidth: '250px' }}>
                            <h3 style={{ 
                              color: '#1e293b', 
                              fontSize: '20px', 
                              marginBottom: '8px',
                              fontWeight: '700'
                            }}>
                              {details.name}
                            </h3>
                            <div style={{ 
                              color: '#64748b', 
                              fontSize: '13px', 
                              fontFamily: 'monospace',
                              fontWeight: '500',
                              wordBreak: 'break-all'
                            }}>
                              {address}
                            </div>
                          </div>
                          <span style={getStatusStyle(details.status)}>
                            {getStatusText(details.status)}
                          </span>
                        </div>

                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
                          gap: '16px', 
                          marginBottom: '16px',
                          padding: '16px',
                          backgroundColor: 'white',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0'
                        }}>
                          <div>
                            <div style={{ 
                              color: '#64748b', 
                              fontSize: '13px', 
                              marginBottom: '6px',
                              fontWeight: '600',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em'
                            }}>
                              Email
                            </div>
                            <div style={{ 
                              fontWeight: '600', 
                              color: '#1e293b',
                              fontSize: '15px'
                            }}>
                              {details.email}
                            </div>
                          </div>
                          <div>
                            <div style={{ 
                              color: '#64748b', 
                              fontSize: '13px', 
                              marginBottom: '6px',
                              fontWeight: '600',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em'
                            }}>
                              Party
                            </div>
                            <div style={{ 
                              fontWeight: '600', 
                              color: '#1e293b',
                              fontSize: '15px'
                            }}>
                              {details.party}
                            </div>
                          </div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                          <div style={{ 
                            color: '#64748b', 
                            fontSize: '13px', 
                            marginBottom: '10px',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                          }}>
                            Manifesto
                          </div>
                          <div style={{ 
                            padding: '16px', 
                            backgroundColor: 'white', 
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            lineHeight: '1.7',
                            color: '#334155',
                            fontSize: '15px'
                          }}>
                            {details.manifesto}
                          </div>
                        </div>

                        {details.status === 1 && (
                          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <button
                              onClick={() => handleApprove(address)}
                              disabled={processing === address}
                              aria-label={`Approve ${details.name}`}
                              style={{
                                flex: 1,
                                minWidth: '160px',
                                padding: '14px 24px',
                                backgroundColor: processing === address ? '#94a3b8' : '#16a34a',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: processing === address ? 'not-allowed' : 'pointer',
                                fontSize: '15px',
                                fontWeight: '700',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                              }}
                              onMouseEnter={(e) => {
                                if (processing !== address) {
                                  e.target.style.backgroundColor = '#15803d';
                                  e.target.style.transform = 'translateY(-1px)';
                                  e.target.style.boxShadow = '0 4px 6px -1px rgba(22, 163, 74, 0.3)';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (processing !== address) {
                                  e.target.style.backgroundColor = '#16a34a';
                                  e.target.style.transform = 'translateY(0)';
                                  e.target.style.boxShadow = 'none';
                                }
                              }}
                            >
                              <span style={{ fontSize: '18px' }}>✓</span>
                              Approve Candidate
                            </button>
                            <button
                              onClick={() => handleReject(address)}
                              disabled={processing === address}
                              aria-label={`Reject ${details.name}`}
                              style={{
                                flex: 1,
                                minWidth: '160px',
                                padding: '14px 24px',
                                backgroundColor: processing === address ? '#94a3b8' : '#dc2626',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: processing === address ? 'not-allowed' : 'pointer',
                                fontSize: '15px',
                                fontWeight: '700',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px'
                              }}
                              onMouseEnter={(e) => {
                                if (processing !== address) {
                                  e.target.style.backgroundColor = '#b91c1c';
                                  e.target.style.transform = 'translateY(-1px)';
                                  e.target.style.boxShadow = '0 4px 6px -1px rgba(220, 38, 38, 0.3)';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (processing !== address) {
                                  e.target.style.backgroundColor = '#dc2626';
                                  e.target.style.transform = 'translateY(0)';
                                  e.target.style.boxShadow = 'none';
                                }
                              }}
                            >
                              <span style={{ fontSize: '18px' }}>✗</span>
                              Reject Candidate
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
