import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import MessageAlert from '../components/MessageAlert';
import { getDeployedContract } from '../utils/contractUtils';
import { 
    decryptShareY, 
    computeTrusteePartialDecryption, 
    generateDecryptionProof 
} from '../utils/thresholdDecryption';
import IPFSClient from '../utils/ipfsClient';
import { performHomomorphicAddition } from '../utils/homomorphicAggregator';
import { verifyCDSProof } from '../utils/voteEncryption';

export default function TrusteeDashboard() {
  const navigate = useNavigate();
  const [walletAddress, setWalletAddress] = useState('');
  const [trusteeIndex, setTrusteeIndex] = useState(null); // 1-based
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const [shareFiles, setShareFiles] = useState({});
  const [sharePassphrases, setSharePassphrases] = useState({});
  const [submitting, setSubmitting] = useState({});

  useEffect(() => { initialize(); }, []);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => { setMessage(''); setMessageType(''); }, 4000);
      return () => clearTimeout(t);
    }
  }, [message]);

  const initialize = async () => {
    try {
      if (!window.ethereum) {
        setMessage('Please install MetaMask!');
        setMessageType('danger');
        return;
      }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const address = accounts[0];
      setWalletAddress(address);

      const { deployedContract } = await getDeployedContract();

      const trusteeInfo = await deployedContract.methods.getTrusteeInfo(address).call();
      if (trusteeInfo.walletAddress.toLowerCase() !== address.toLowerCase()) {  
        setMessage('This wallet is not a registered trustee.');
        setMessageType('danger');
        setTimeout(() => navigate('/'), 2000);
        return;
      }

      const trusteeAddrs = await deployedContract.methods.getTrusteeAddresses().call();
      const idx = trusteeAddrs.findIndex(a => a.toLowerCase() === address.toLowerCase());
      setTrusteeIndex(idx + 1);

      await loadElections(deployedContract, address);
    } catch (err) {
      console.error(err);
      setMessage('Failed to initialise: ' + err.message);
      setMessageType('danger');
    } finally {
      setLoading(false);
    }
  };

  const loadElections = async (contract, address) => {
    try {
      const ids = await contract.methods.getAllElectionIds().call();
      const rows = [];

      for (const id of ids) {
        const info = await contract.methods.getElectionInfo(id).call();
        const tally = await contract.methods.getEncryptedTally(id).call();      
        const results = await contract.methods.getResults(id).call();
        const pdStr = await contract.methods.getPartialDecryption(id, address).call();

        rows.push({
          id: Number(id),
          title: info.title,
          endTime: Number(info.endTime),
          tallyStored: tally.tallyStored,
          encryptedTally: tally.encryptedTally,
          resultsPublished: results.resultsPublished,
          pdSubmitted: pdStr !== "",
        });
      }

      rows.sort((a, b) => b.endTime - a.endTime);
      setElections(rows);
    } catch (err) {
      console.error('Error loading elections:', err);
      setMessage('Error loading elections: ' + err.message);
      setMessageType('danger');
    }
  };

  const handleLogout = () => {
    setWalletAddress('');
    navigate('/');
  };

  const handleFileChange = (e, electionId) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target.result);
          
          if (json.share_index !== trusteeIndex) {
            setMessage(`Invalid share file! This account is Trustee #${trusteeIndex}, but you uploaded the file for Trustee #${json.share_index}.`);
            setMessageType('danger');
            setShareFiles(prev => { const newFiles = {...prev}; delete newFiles[electionId]; return newFiles; });
            return;
          }

          setShareFiles(prev => ({ ...prev, [electionId]: json }));
          setMessage(`âœ… Loaded trustee_${json.share_index}.json correctly.`);
          setMessageType('success');
        } catch (err) {
          setMessage('Invalid JSON file format.');
          setMessageType('danger');
        }
      };
      reader.readAsText(file);
    }
  };

  const handlePassphraseChange = (e, electionId) => {
    setSharePassphrases(prev => ({ ...prev, [electionId]: e.target.value }));
  };

  const handleSubmitPartialDecryption = async (election) => {
    const shareData = shareFiles[election.id];
    const passphrase = sharePassphrases[election.id];
    
    if (!shareData || !passphrase) {
        setMessage('Please upload your share file and enter your passphrase.');
        setMessageType('danger');
        return;
    }

    setSubmitting(prev => ({ ...prev, [election.id]: true }));

    try {
        const s_i = await decryptShareY(shareData.encrypted_y, passphrase);
        const { web3, deployedContract } = await getDeployedContract();
        const pubKeyN = await deployedContract.methods.getPaillierPublicKey().call();

        let tallyPayload;
        try { tallyPayload = JSON.parse(election.encryptedTally); } catch { tallyPayload = { encrypted_total: election.encryptedTally }; }

          // --- Failsafe: Verify the Organizer's Encrypted Tally ---
          setMessage('Verifying ZKP proofs and homomorphic tallies...');
          
          try {
              const nullifiers = await deployedContract.methods.getZKPVoteNullifiers(election.id).call();
              const ipfsClient = new IPFSClient();
              const isIPFSAvailable = await ipfsClient.isAvailable();
              if (!isIPFSAvailable) throw new Error('IPFS Desktop must be running.');
              
              const approvedCandidates = await deployedContract.methods.getApprovedCandidates(election.id).call();
              const numCandidates = approvedCandidates.length;

              const ciphertexts = [];
              let voteBlockFromIPFS = null;
              let validPlaintexts = [];

              for (let i = 0; i < nullifiers.length; i++) {
                const nullifier = nullifiers[i];
                const ipfsCID = await deployedContract.methods.getZKPVote(election.id, nullifier).call();
                if (!ipfsCID) continue;

                const votePackage = await ipfsClient.retrieveJSON(ipfsCID);
                const ct = votePackage.encrypted_vote ?? votePackage.ciphertext;
                if (!ct) continue;

                if (voteBlockFromIPFS === null && votePackage.vote_block) {
                  voteBlockFromIPFS = String(votePackage.vote_block);
                  const B_bigint = BigInt(voteBlockFromIPFS);
                  for (let c = 0; c < numCandidates; c++) {
                    validPlaintexts.push(B_bigint ** BigInt(c));
                  }
                }

                if (!votePackage.paillier_zkp || !(await verifyCDSProof(pubKeyN, ct, votePackage.paillier_zkp, validPlaintexts))) {
                    console.warn(`[Trustee Security] Invalid or missing CDS proof for vote ${ipfsCID}. Dropping vote...`);
                    continue; // Skip, exactly as Organizer does
                }
                ciphertexts.push(ct);
              }
              
              const expectedTotal = performHomomorphicAddition(pubKeyN, ciphertexts);
              
              let organizerTotal = String(tallyPayload.encrypted_total);
              
              if (organizerTotal !== String(expectedTotal)) {
                  console.error("Mismatch:", organizerTotal, expectedTotal);
                  throw new Error('MALICIOUS ORGANIZER DETECTED! Tally does not match the IPFS CIDs. Refusing to decrypt.');
              }
          } catch(e) {
              setMessage('Verification aborted: ' + e.message);
              setMessageType('danger');
              setSubmitting(prev => ({ ...prev, [election.id]: false }));
              return;
          }
          // --- Verification Successful, Proceed with Decryption ---

          // 1. Generate standard partial decryption
          const rawPd_i = computeTrusteePartialDecryption(tallyPayload.encrypted_total, s_i, pubKeyN);

          // 2. Wrap it with Chaum-Pedersen ZKP for robust DoS protection
          // shareData.v and shareData.v_i are implicitly handled if the file was generated nicely.
          let finalSubmitPayload = rawPd_i;
          if (shareData.v && shareData.v_i) {
            console.log("Generating Zero-Knowledge Proof for Partial Decryption...");
            const zkp = await generateDecryptionProof(
              tallyPayload.encrypted_total, // C
              s_i,                          // s_i
              shareData.v,                  // generic generator v
              shareData.v_i,                // trustee's specific public verification share V_i
              pubKeyN                       // Paillier mod n
            );
            finalSubmitPayload = JSON.stringify({
              pd_i: zkp.pd_i,
              proof: { e: zkp.e, z: zkp.z }
            });
          } else {
             // Fallback for older election arrays before the DoS patch
             console.warn("No public verification share found. Falling back to unprotected Partial Decryption.");
          }

          await deployedContract.methods.submitPartialDecryption(election.id, finalSubmitPayload).send({
            from: walletAddress,
            gas: 3000000,
            maxPriorityFeePerGas: web3.utils.toWei('30', 'gwei')
        });

        setMessage('Partial decryption submitted successfully! The organizer will now be able to tally the results.');
        setMessageType('success');
        
        await loadElections(deployedContract, walletAddress);

    } catch (err) {
        console.error(err);
        setMessage('Failed to compute or submit partial decryption: ' + err.message);
        setMessageType('danger');
    } finally {
        setSubmitting(prev => ({ ...prev, [election.id]: false }));
    }
  };

  const formatDate = (ts) =>
    new Date(ts * 1000).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });

  const getStatusBadge = (e) => {
    if (e.resultsPublished) return { label: 'Results Published', bg: '#6c757d' };
    if (e.tallyStored && e.pdSubmitted) return { label: 'PD Submitted', bg: '#10b981' };
    if (e.tallyStored) return { label: 'Action Required', bg: '#ef4444' };
    if (Date.now() / 1000 > e.endTime) return { label: 'Awaiting Aggregation', bg: '#fd7e14' };
    return { label: 'Voting In Progress', bg: '#17a2b8' };
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
        <Navbar walletAddress={walletAddress} userRole="trustee" onLogout={handleLogout} />
        <Sidebar userRole="trustee" />
        <div style={{ marginLeft: '70px', paddingTop: 'calc(70px + 40px)', textAlign: 'center' }}>
          <p style={{ color: '#64748b', fontSize: '18px' }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Navbar walletAddress={walletAddress} userRole="trustee" onLogout={handleLogout} />
      <Sidebar userRole="trustee" />
      
      <div style={{ 
        marginLeft: '70px',
        maxWidth: 'calc(100% - 70px)',
        padding: '2.5rem 2rem',
        paddingTop: 'calc(70px + 2.5rem)',
        boxSizing: 'border-box'
      }}>
        <div style={{ marginTop: '12px' }}>
          <MessageAlert message={message} type={messageType} />
        </div>
        
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ color: '#1e293b', fontSize: '32px', fontWeight: '700', marginBottom: '8px' }}>
            🔑 Trustee Dashboard
          </h1>
          <p style={{ color: '#64748b', fontSize: '16px' }}>
            Trustee #{trusteeIndex} — Compute and submit your Partial Decryptions securely.
          </p>
        </div>

        {elections.length === 0 ? (
          <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '48px', textAlign: 'center' }}>
            <p style={{ color: '#94a3b8', fontSize: '18px' }}>No elections found.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {elections.map(e => {
              const badge = getStatusBadge(e);
              return (
                <div key={e.id} style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <h3 style={{ margin: 0, color: '#1e293b', fontSize: '18px', fontWeight: '600' }}>{e.title}</h3>
                        <span style={{ backgroundColor: badge.bg, color: '#fff', fontSize: '12px', fontWeight: '600', padding: '3px 10px', borderRadius: '20px' }}>{badge.label}</span>
                      </div>
                      <p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>Election #{e.id} · Ended: {formatDate(e.endTime)}</p>
                    </div>
                  </div>

                  {e.tallyStored && !e.resultsPublished && !e.pdSubmitted && (
                    <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
                      <p style={{ color: '#1e293b', fontWeight: 'bold', marginBottom: '12px' }}>Action Required: Compute Partial Decryption</p>
                      <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '16px' }}>
                        Please upload your share file (<code>trustee_{trusteeIndex}.json</code>) and enter your passphrase to locally decrypt your share and compute your Partial Decryption.
                      </p>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <div>
                          <input type="file" accept=".json" onChange={(event) => handleFileChange(event, e.id)} style={{ display: 'block', fontSize: '14px' }} />
                        </div>
                        <div>
                          <input type="password" placeholder="Share Passphrase" onChange={(event) => handlePassphraseChange(event, e.id)} value={sharePassphrases[e.id] || ''} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', width: '220px' }} />
                        </div>
                        <button
                          onClick={() => handleSubmitPartialDecryption(e)}
                          disabled={submitting[e.id]}
                          style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', backgroundColor: '#3b82f6', color: '#fff', fontWeight: '600', fontSize: '14px', cursor: submitting[e.id] ? 'not-allowed' : 'pointer', opacity: submitting[e.id] ? 0.7 : 1 }}
                        >
                          {submitting[e.id] ? 'Submitting...' : 'Submit Partial Decryption'}
                        </button>
                      </div>
                    </div>
                  )}

                  {e.pdSubmitted && !e.resultsPublished && (
                     <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e2e8f0' }}>
                     <div style={{ padding: '10px 14px', backgroundColor: '#dcfce7', borderRadius: '8px', color: '#166534', fontSize: '13px', fontWeight: 'bold' }}>
                       ✓ You have successfully submitted your Partial Decryption for this election. Awaiting Organizer completion.
                     </div>
                   </div>
                  )}

                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}