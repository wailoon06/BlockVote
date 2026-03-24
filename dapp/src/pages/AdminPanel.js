import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDeployedContract } from '../utils/contractUtils';
import MessageAlert from '../components/MessageAlert';
import Navbar from '../components/Navbar';

export default function AdminPanel() {
  const navigate = useNavigate();
  const [walletAddress, setWalletAddress] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingOrganizers, setPendingOrganizers] = useState([]);
  const [organizerDetails, setOrganizerDetails] = useState({});
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalVoters: 0,
    totalCandidates: 0,
    totalOrganizers: 0,
    verifiedVoters: 0,
    verifiedCandidates: 0,
    approvedOrganizers: 0,
    pendingOrganizers: 0
  });

  useEffect(() => {
    connectAndCheckAdmin();
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

  const connectAndCheckAdmin = async () => {
    try {
      if (typeof window.ethereum !== 'undefined') {
        const accounts = await window.ethereum.request({ 
          method: 'eth_requestAccounts' 
        });
        
        if (accounts.length > 0) {
          const address = accounts[0];
          setWalletAddress(address);
          
          const { deployedContract } = await getDeployedContract();
          const adminStatus = await deployedContract.methods.isAdmin(address).call();
          
          if (adminStatus) {
            setIsAdmin(true);
            await loadPendingOrganizers();
          } else {
            setMessage('Access denied. You are not the admin.');
            setMessageType('danger');
          }
        }
      } else {
        setMessage('Please install MetaMask!');
        setMessageType('danger');
      }
    } catch (error) {
      console.error('Error connecting:', error);
      setMessage('Failed to connect: ' + error.message);
      setMessageType('danger');
    } finally {
      setIsLoading(false);
    }
  };

  const loadPendingOrganizers = async () => {
    try {
      const { deployedContract } = await getDeployedContract();
      const pending = await deployedContract.methods.getPendingOrganizers().call();
      setPendingOrganizers(pending);
      
      // Load details for each pending organizer
      const details = {};
      for (const address of pending) {
        const info = await deployedContract.methods.getOrganizerInfo(address).call();
        details[address] = info;
      }
      setOrganizerDetails(details);

      // Load statistics
      await loadStatistics();
    } catch (error) {
      console.error('Error loading organizers:', error);
      setMessage('Failed to load pending organizers: ' + error.message);
      setMessageType('danger');
    }
  };

  const loadStatistics = async () => {
    try {
      const { deployedContract } = await getDeployedContract();
      
      const voterAddresses = await deployedContract.methods.getAllVoterAddresses().call();
      const candidateAddresses = await deployedContract.methods.getAllCandidateAddresses().call();
      const organizerAddresses = await deployedContract.methods.getAllOrganizers().call();
      
      let verifiedVoters = 0;
      for (const address of voterAddresses) {
        const info = await deployedContract.methods.getVoterInfo(address).call();
        if (info.status === 'VERIFIED') verifiedVoters++;
      }
      
      let verifiedCandidates = 0;
      for (const address of candidateAddresses) {
        const info = await deployedContract.methods.getCandidateInfo(address).call();
        if (info.status === 'VERIFIED') verifiedCandidates++;
      }
      
      let approvedOrganizers = 0;
      for (const address of organizerAddresses) {
        const info = await deployedContract.methods.getOrganizerInfo(address).call();
        if (info.status === 'APPROVED') approvedOrganizers++;
      }
      
      setStats({
        totalVoters: voterAddresses.length,
        totalCandidates: candidateAddresses.length,
        totalOrganizers: organizerAddresses.length,
        verifiedVoters,
        verifiedCandidates,
        approvedOrganizers,
        pendingOrganizers: organizerAddresses.length - approvedOrganizers
      });
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  };

  const handleLogout = () => {
    setWalletAddress('');
    setIsAdmin(false);
    navigate('/');
  };

  const approveOrganizer = async (address) => {
    try {
      setMessage('Approving organizer...');
      setMessageType('info');

      const { web3, deployedContract } = await getDeployedContract();
      
      await deployedContract.methods
        .verifyOrganizer(address)
        .send({ 
          from: walletAddress,
          maxPriorityFeePerGas: web3.utils.toWei('30', 'gwei')
          ,gas: 3000000
        });

      setMessage('Organizer approved successfully!');
      setMessageType('success');
      
      // Reload pending list and statistics
      await loadPendingOrganizers();
    } catch (error) {
      console.error('Approval error:', error);
      setMessage('Failed to approve: ' + error.message);
      setMessageType('danger');
    }
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '1.5rem', color: '#1e3a5f' }}>Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa' }}>
        <Navbar walletAddress={walletAddress} onLogout={handleLogout} userRole="admin" />
        <div style={{ maxWidth: '700px', margin: '0 auto', padding: '3rem 1.5rem', paddingTop: 'calc(70px + 3rem)', textAlign: 'center' }}>
          <MessageAlert message={message} type={messageType} onClose={() => setMessage('')} />
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}></div>
          <h2 style={{ color: '#1e3a5f', marginBottom: '1rem' }}>Access Denied</h2>
          <p style={{ color: '#6c757d', marginBottom: '2rem' }}>You must be the admin to access this panel.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa' }}>
      <Navbar walletAddress={walletAddress} onLogout={handleLogout} userRole="admin" />
      
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '3rem 1.5rem', paddingTop: 'calc(70px + 3rem)' }}>
        {/* Header */}
        <div style={{ marginBottom: '3rem' }}>
          <div
            onClick={() => navigate('/')}
            style={{ cursor: 'pointer', display: 'inline-block' }}
          >
            <h1 style={{ 
              fontSize: '2.5rem', 
              fontWeight: '600', 
              marginBottom: '0.75rem',
              color: '#1e3a5f'
            }}>
              Admin Dashboard
            </h1>
            <p style={{ color: '#6c757d', fontSize: '1rem', margin: 0 }}>
              Manage organizer applications and monitor platform statistics
            </p>
          </div>
        </div>

        <MessageAlert message={message} type={messageType} onClose={() => setMessage('')} />

        {/* Statistics Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1.5rem',
          marginBottom: '3rem'
        }}>
          {/* Total Users Card */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            padding: '2rem',
            border: '1px solid #e8e8e8',
            transition: 'transform 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>👥</div>
            <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1e3a5f', marginBottom: '0.25rem' }}>
              {stats.totalVoters + stats.totalCandidates + stats.totalOrganizers}
            </div>
            <div style={{ color: '#6c757d', fontSize: '0.95rem', fontWeight: '500' }}>Total Users</div>
          </div>

          {/* Voters Card */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            padding: '2rem',
            border: '1px solid #e8e8e8',
            transition: 'transform 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🗳️</div>
            <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1e3a5f', marginBottom: '0.25rem' }}>
              {stats.totalVoters}
            </div>
            <div style={{ color: '#6c757d', fontSize: '0.95rem', fontWeight: '500' }}>
              Voters ({stats.verifiedVoters} verified)
            </div>
          </div>

          {/* Candidates Card */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            padding: '2rem',
            border: '1px solid #e8e8e8',
            transition: 'transform 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>👤</div>
            <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1e3a5f', marginBottom: '0.25rem' }}>
              {stats.totalCandidates}
            </div>
            <div style={{ color: '#6c757d', fontSize: '0.95rem', fontWeight: '500' }}>
              Candidates ({stats.verifiedCandidates} verified)
            </div>
          </div>

          {/* Organizers Card */}
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            padding: '2rem',
            border: '1px solid #e8e8e8',
            transition: 'transform 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🏢</div>
            <div style={{ fontSize: '2rem', fontWeight: '700', color: '#1e3a5f', marginBottom: '0.25rem' }}>
              {stats.totalOrganizers}
            </div>
            <div style={{ color: '#6c757d', fontSize: '0.95rem', fontWeight: '500' }}>
              Organizers ({stats.approvedOrganizers} approved)
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          padding: '2rem',
          marginBottom: '3rem',
          border: '1px solid #e8e8e8'
        }}>
          <h3 style={{ color: '#1e3a5f', marginBottom: '1.5rem', fontSize: '1.25rem', fontWeight: '600' }}>
            Quick Actions
          </h3>
          <button
            onClick={() => navigate('/users')}
            style={{
              padding: '1rem',
              backgroundColor: '#1e3a5f',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              width: '100%'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#2c5282';
              e.target.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = '#1e3a5f';
              e.target.style.transform = 'translateY(0)';
            }}
          >
            📊 View All Users
          </button>
        </div>

        {/* Pending Applications Section */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          padding: '2rem',
          border: '1px solid #e8e8e8'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h3 style={{ color: '#1e3a5f', fontSize: '1.25rem', fontWeight: '600', margin: 0 }}>
              Pending Organizer Applications
              {pendingOrganizers.length > 0 && (
                <span style={{
                  marginLeft: '0.75rem',
                  padding: '0.25rem 0.75rem',
                  backgroundColor: '#ffc107',
                  color: '#856404',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  fontWeight: '600'
                }}>
                  {pendingOrganizers.length}
                </span>
              )}
            </h3>
          </div>

        {pendingOrganizers.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '3rem 2rem'
          }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}></div>
            <h4 style={{ color: '#1e3a5f', marginBottom: '0.5rem' }}>No Pending Applications</h4>
            <p style={{ color: '#6c757d' }}>All organizer applications have been processed.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {pendingOrganizers.map((address, index) => {
              const details = organizerDetails[address];
              if (!details) return null;

              return (
                <div 
                  key={address}
                  style={{
                    padding: '1.5rem',
                    backgroundColor: '#f5f7fa',
                    borderRadius: '0.5rem',
                    border: '1px solid #e0e0e0'
                  }}
                >
                  <div style={{ marginBottom: '1rem' }}>
                    <strong style={{ color: '#1e3a5f', fontSize: '1.1rem' }}>
                      {details.organizationName}
                    </strong>
                  </div>
                  
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    <strong style={{ color: '#1e3a5f' }}>Wallet:</strong>
                    <span style={{ marginLeft: '0.5rem', color: '#6c757d', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {address.substring(0, 10)}...{address.substring(address.length - 8)}
                    </span>
                  </div>
                  
                  <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                    <strong style={{ color: '#1e3a5f' }}>Email:</strong>
                    <span style={{ marginLeft: '0.5rem', color: '#6c757d' }}>
                      {details.email}
                    </span>
                  </div>
                  
                  <div style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                    <strong style={{ color: '#1e3a5f' }}>Description:</strong>
                    <div style={{ 
                      marginTop: '0.5rem', 
                      padding: '0.75rem',
                      backgroundColor: 'white',
                      borderRadius: '0.375rem',
                      color: '#495057',
                      lineHeight: '1.6'
                    }}>
                      {details.description}
                    </div>
                  </div>
                  
                  <div style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                    <strong style={{ color: '#1e3a5f' }}>Applied:</strong>
                    <span style={{ marginLeft: '0.5rem', color: '#6c757d' }}>
                      {new Date(Number(details.registeredAt) * 1000).toLocaleString()}
                    </span>
                  </div>

                  <button
                    onClick={() => approveOrganizer(address)}
                    style={{
                      padding: '0.75rem 1.5rem',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      fontSize: '1rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      width: '100%'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.backgroundColor = '#218838';
                      e.target.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.backgroundColor = '#28a745';
                      e.target.style.transform = 'translateY(0)';
                    }}
                  >
                    ✓ Approve Organization
                  </button>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
