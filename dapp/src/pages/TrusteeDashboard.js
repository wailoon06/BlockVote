import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import MessageAlert from '../components/MessageAlert';
import IPFSClient from '../utils/ipfsClient';
import { getDeployedContract } from '../utils/contractUtils';

export default function TrusteeDashboard() {
  const navigate = useNavigate();
  const [walletAddress, setWalletAddress] = useState('');
  const [trusteeIndex, setTrusteeIndex] = useState(null); // 1-based
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  // Per-election share submission state (keyed by electionId)
  const [shareFiles, setShareFiles] = useState({});       // unused placeholder
  const [sharePassphrases, setSharePassphrases] = useState({}); // unused placeholder

  useEffect(() => { initialize(); }, []);

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => { setMessage(''); setMessageType(''); }, 3000);
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

      // Verify this wallet is a registered trustee
      const trusteeInfo = await deployedContract.methods.getTrusteeInfo(address).call();
      if (trusteeInfo.walletAddress.toLowerCase() !== address.toLowerCase()) {
        setMessage('This wallet is not a registered trustee.');
        setMessageType('danger');
        setTimeout(() => navigate('/'), 2000);
        return;
      }

      // Find 1-based index of this trustee
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

        rows.push({
          id: Number(id),
          title: info.title,
          endTime: Number(info.endTime),
          tallyStored: tally.tallyStored,
          resultsPublished: results.resultsPublished,
        });
      }

      // Show most-recently-ended first
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

  const formatDate = (ts) =>
    new Date(ts * 1000).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });

  const getStatusBadge = (e) => {
    if (e.resultsPublished)            return { label: 'Results Published',   bg: '#6c757d' };
    if (e.tallyStored)                 return { label: 'Awaiting Decryption', bg: '#f59e0b' };
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
      <MessageAlert message={message} type={messageType} />

      <div style={{ marginLeft: '70px', padding: '40px 30px', paddingTop: 'calc(70px + 40px)', maxWidth: '1200px' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ color: '#1e293b', fontSize: '32px', fontWeight: '700', marginBottom: '8px' }}>
            🔐 Trustee Dashboard
          </h1>
          <p style={{ color: '#64748b', fontSize: '16px' }}>
            Trustee #{trusteeIndex} — when voting ends, securely transfer your share file to the election organizer so they can decrypt and publish results.
          </p>
        </div>

        {/* Info card */}
        <div style={{
          backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px',
          padding: '16px 20px', marginBottom: '28px', display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <span style={{ fontSize: '24px' }}>ℹ️</span>
          <p style={{ color: '#1e40af', margin: 0, fontSize: '14px' }}>
            Your trustee key share is stored in <code>trustee_shares/trustee_{trusteeIndex}.json</code>.
            Hand this file to the election organizer when they need to decrypt results. Keep it secret!
          </p>
        </div>

        {/* Election list */}
        {elections.length === 0 ? (
          <div style={{
            backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px',
            padding: '48px', textAlign: 'center'
          }}>
            <p style={{ color: '#94a3b8', fontSize: '18px' }}>No elections found.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {elections.map(e => {
              const badge = getStatusBadge(e);
              return (
                <div key={e.id} style={{
                  backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px',
                  padding: '24px', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', gap: '16px', flexWrap: 'wrap'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, color: '#1e293b', fontSize: '18px', fontWeight: '600' }}>
                        {e.title}
                      </h3>
                      <span style={{
                        backgroundColor: badge.bg, color: '#fff', fontSize: '12px',
                        fontWeight: '600', padding: '3px 10px', borderRadius: '20px'
                      }}>
                        {badge.label}
                      </span>
                    </div>
<p style={{ color: '#64748b', margin: 0, fontSize: '14px' }}>
                    Election #{e.id} · Ended: {formatDate(e.endTime)}
                  </p>
                </div>

                {/* Decryption required notice */}
                {e.tallyStored && !e.resultsPublished && (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e2e8f0', width: '100%' }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
                      🔑 Decryption Required
                    </div>
                    <div style={{ padding: '10px 14px', backgroundColor: '#fef3c7', borderRadius: '8px', color: '#92400e', fontSize: '13px' }}>
                      Provide your share file (<code>trustee_shares/trustee_{trusteeIndex}.json</code>) and
                      passphrase to the election organizer so they can perform threshold decryption and publish results.
                    </div>
                  </div>
                )}

                  <button
                    onClick={() => navigate('/organizer-manage-election', { state: { electionId: e.id } })}
                    style={{
                      padding: '10px 20px', borderRadius: '8px', border: 'none',
                      cursor: 'pointer', fontWeight: '600', fontSize: '14px',
                      backgroundColor: '#e2e8f0', color: '#64748b',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    View Election
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
