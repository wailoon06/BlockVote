import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Sidebar from '../components/Sidebar';
import MessageAlert from '../components/MessageAlert';
import { getDeployedContract } from '../utils/contractUtils';

function VoterDashboard() {
  const navigate = useNavigate();
  const [contract, setContract] = useState(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [voterInfo, setVoterInfo] = useState(null);
  const [statistics, setStatistics] = useState({
    totalElections: 0,
    activeElections: 0,
    votedElections: 0,
    upcomingElections: 0
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

        await checkVoterStatus(deployedContract, accounts[0]);
        await loadStatistics(deployedContract, accounts[0]);
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

  const checkVoterStatus = async (contractInstance, address) => {
    try {
      const isRegistered = await contractInstance.methods
        .isVoterRegistered(address)
        .call();

      if (!isRegistered) {
        setMessage({ text: 'You are not registered as a voter', type: 'error' });
        setTimeout(() => navigate('/'), 2000);
        return;
      }

      const info = await contractInstance.methods
        .getVoterInfo(address)
        .call();

      if (info.status !== 'VERIFIED') {
        setMessage({ text: 'Your voter profile needs to be verified first', type: 'warning' });
        setTimeout(() => navigate('/verify'), 2000);
        return;
      }

      setVoterInfo({
        name: info.name,
        email: info.email,
        icNumber: info.icNumber,
        status: info.status,
        registeredAt: new Date(Number(info.registeredAt) * 1000).toLocaleDateString(),
        verifiedAt: new Date(Number(info.verifiedAt) * 1000).toLocaleDateString()
      });
    } catch (error) {
      console.error('Error checking voter status:', error);
      setMessage({ text: 'Error verifying voter status', type: 'error' });
    }
  };

  const loadStatistics = async (contractInstance, address) => {
    try {
      const totalElections = await contractInstance.methods.getTotalElections().call();
      let activeCount = 0;
      let votedCount = 0;
      let upcomingCount = 0;

      const now = Math.floor(Date.now() / 1000);

      for (let i = 1; i <= totalElections; i++) {
        const info = await contractInstance.methods.getElectionInfo(i).call();
        const hasVoted = false; // ZKP voting is anonymous — per-address voted status is not stored on-chain

        if (hasVoted) {
          votedCount++;
        }

        if (info.isActive && now >= Number(info.startTime) && now <= Number(info.endTime)) {
          activeCount++;
        } else if (now < Number(info.startTime)) {
          upcomingCount++;
        }
      }

      setStatistics({
        totalElections: Number(totalElections),
        activeElections: activeCount,
        votedElections: votedCount,
        upcomingElections: upcomingCount
      });
    } catch (error) {
      console.error('Error loading statistics:', error);
      setMessage({ text: 'Error loading statistics', type: 'error' });
    }
  };

  const handleLogout = () => {
    setWalletAddress('');
    setVoterInfo(null);
    navigate('/');
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(to bottom, #f8fafc 0%, #e2e8f0 100%)' }}>
      <Navbar 
        title="BlockVote - Voter Dashboard"
        walletAddress={walletAddress}
        onLogout={handleLogout}
        userRole="voter"
        userStatus={voterInfo?.status}
      />
      <Sidebar userRole="voter" />

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
            <span style={{ fontSize: '2rem' }}>🗳️</span>
            <h1 style={{ 
              fontSize: '2rem', 
              margin: 0,
              color: '#1e293b',
              fontWeight: '700'
            }}>
              Voter Dashboard
            </h1>
          </div>
          <p style={{ 
            fontSize: '1.05rem',
            color: '#64748b',
            margin: 0
          }}>
            Welcome back, {voterInfo?.name || 'Voter'}! Exercise your right to vote
          </p>
        </div>

        {/* Voter Profile Card */}
        {voterInfo && (
          <div style={{ 
            marginBottom: '2rem', 
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', 
            color: 'white', 
            borderRadius: '16px',
            padding: '2rem',
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
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
                    <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{voterInfo.name}</div>
                  </div>
                  <div>
                    <div style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>Email</div>
                    <div style={{ fontWeight: '600', fontSize: '1.1rem' }}>{voterInfo.email}</div>
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
                ✓ {voterInfo.status}
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
                  Total Elections
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1e293b' }}>
                  {statistics.totalElections}
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
                🔴
              </div>
              <div>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem', fontWeight: '500' }}>
                  Active Now
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1e293b' }}>
                  {statistics.activeElections}
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
                background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem'
              }}>
                ✓
              </div>
              <div>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem', fontWeight: '500' }}>
                  Votes Cast
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1e293b' }}>
                  {statistics.votedElections}
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
                ⏰
              </div>
              <div>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem', fontWeight: '500' }}>
                  Upcoming
                </div>
                <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1e293b' }}>
                  {statistics.upcomingElections}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Welcome Message / Quick Actions */}
        <div style={{
          background: 'white',
          borderRadius: '16px',
          padding: '3rem 2rem',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '1.5rem', opacity: 0.3 }}>🗳️</div>
          <h3 style={{ 
            fontSize: '1.5rem', 
            marginBottom: '0.75rem',
            color: '#1e293b',
            fontWeight: '600'
          }}>Your Voice Matters</h3>
          <p style={{ 
            fontSize: '1rem', 
            marginBottom: '2rem',
            color: '#64748b',
            maxWidth: '600px',
            margin: '0 auto 2rem'
          }}>
            Participate in democratic elections and make your vote count. Browse available elections and cast your vote securely.
          </p>
          <button
            onClick={() => navigate('/voter-elections', { state: { walletAddress } })}
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
            🗳️ View Elections & Vote
          </button>
        </div>
      </div>
    </div>
  );
}

export default VoterDashboard;
