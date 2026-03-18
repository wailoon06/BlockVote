import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDeployedContract } from '../utils/contractUtils';
import MessageAlert from '../components/MessageAlert';
import Navbar from '../components/Navbar';
import refreshIcon from '../images/refresh.png';

export default function AllUsers() {
  const navigate = useNavigate();
  const [walletAddress, setWalletAddress] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalUsers, setTotalUsers] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterRole, setFilterRole] = useState('ALL');

  useEffect(() => {
    checkAdminAndLoadUsers();
  }, []);

  const checkAdminAndLoadUsers = async () => {
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
            await loadUsers();
          } else {
            setError('Access denied. Admin only.');
            setLoading(false);
          }
        }
      } else {
        setError('Please install MetaMask!');
        setLoading(false);
      }
    } catch (err) {
      console.error('Error checking admin:', err);
      setError('Failed to verify admin status');
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setWalletAddress('');
    setIsAdmin(false);
    navigate('/');
  };

  const goHome = () => {
    navigate('/', { replace: true });
  };

  const loadUsers = async () => {
    setLoading(true);
    setError('');

    try {
      const { deployedContract } = await getDeployedContract();

      const voterAddresses = await deployedContract.methods.getAllVoterAddresses().call();
      const candidateAddresses = await deployedContract.methods.getAllCandidateAddresses().call();
      const organizerAddresses = await deployedContract.methods.getAllOrganizers().call();
      
      const voterPromises = voterAddresses.map(async (address) => {
        const info = await deployedContract.methods.getVoterInfo(address).call();
        return {
          wallet: address,
          name: sessionStorage.getItem('voter_name_' + address) || '[ZKP Hashed]',
          email: sessionStorage.getItem('voter_email_' + address) || '[ZKP Hashed]',
          status: info.status,
          role: 'Voter',
          registeredAt: new Date(parseInt(info.registeredAt) * 1000),
          verifiedAt: parseInt(info.verifiedAt) > 0 ? new Date(parseInt(info.verifiedAt) * 1000) : null
        };
      });

      const candidatePromises = candidateAddresses.map(async (address) => {
        const info = await deployedContract.methods.getCandidateInfo(address).call();
        return {
          wallet: address,
          name: info.name,
          email: info.email,
          status: info.status,
          role: 'Candidate',
          party: info.party,
          registeredAt: new Date(parseInt(info.registeredAt) * 1000),
          verifiedAt: parseInt(info.verifiedAt) > 0 ? new Date(parseInt(info.verifiedAt) * 1000) : null
        };
      });

      const organizerPromises = organizerAddresses.map(async (address) => {
        const info = await deployedContract.methods.getOrganizerInfo(address).call();
        return {
          wallet: address,
          name: info.organizationName,
          email: info.email,
          status: info.status,
          role: 'Organizer',
          registeredAt: new Date(parseInt(info.registeredAt) * 1000),
          verifiedAt: info.status === 'APPROVED' ? new Date(parseInt(info.registeredAt) * 1000) : null
        };
      });

      const allUsers = await Promise.all([...voterPromises, ...candidatePromises, ...organizerPromises]);
      setUsers(allUsers);
      setTotalUsers(allUsers.length);

    } catch (err) {
      console.error('Error loading voters:', err);
      setError(err.message || 'Failed to load voters');
    }

    setLoading(false);
  };

  const filteredUsers = users.filter(user => {
    const safeName = user.name || '';
    const safeEmail = user.email || '';
    const safeWallet = user.wallet || '';
    
    const matchesSearch = 
      safeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      safeEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
      safeWallet.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.party && user.party.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = filterStatus === 'ALL' || user.status === filterStatus;
    const matchesRole = filterRole === 'ALL' || user.role === filterRole;
    
    return matchesSearch && matchesStatus && matchesRole;
  });

  const getStatusBadgeStyle = (status) => {
    const baseStyle = {
      padding: '0.375rem 0.875rem',
      borderRadius: '12px',
      fontSize: '0.8125rem',
      fontWeight: '600',
      display: 'inline-block'
    };

    if (status === 'VERIFIED' || status === 'APPROVED') {
      return {
        ...baseStyle,
        backgroundColor: '#d1fae5',
        color: '#065f46'
      };
    } else {
      return {
        ...baseStyle,
        backgroundColor: '#fef3c7',
        color: '#92400e'
      };
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa' }}>
      <Navbar walletAddress={walletAddress} onLogout={handleLogout} userRole="admin" />
      
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '3rem 1.5rem', paddingTop: 'calc(70px + 3rem)' }}>
        {/* Header */}
        <div style={{ marginBottom: '3rem' }}>
          <div
            onClick={goHome}
            style={{ cursor: 'pointer', display: 'inline-block' }}
          >
            <h1 style={{ 
              fontSize: '2.5rem', 
              fontWeight: '600', 
              marginBottom: '0.75rem',
              color: '#1e3a5f'
            }}>
              All Users
            </h1>
            <p style={{ color: '#6c757d', fontSize: '1rem', margin: 0 }}>
              View and manage all registered users • Total: <strong>{totalUsers}</strong> user{totalUsers !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <MessageAlert message={error} type={error ? 'danger' : ''} onClose={() => setError('')} />

        {/* Filter Card */}
        <div style={{
          backgroundColor: 'white',
          borderRadius: '0.75rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          padding: '1.75rem',
          marginBottom: '2rem',
          border: '1px solid #e8e8e8'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ 
              color: '#1e3a5f',
              fontSize: '1.25rem',
              fontWeight: '600',
              margin: 0
            }}>
              Filter Users
            </h2>
            <button
              onClick={loadUsers}
              style={{
                backgroundColor: 'transparent',
                color: '#1e3a5f',
                border: 'none',
                padding: '0.5rem',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = 'rgba(30,58,95,0.1)';
                e.target.style.transform = 'rotate(180deg)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.transform = 'rotate(0deg)';
              }}
              title="Refresh users"
            >
              <img src={refreshIcon} alt="Refresh" style={{ width: '28px', height: '28px' }} />
            </button>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '1', minWidth: '300px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem', 
                fontWeight: '600',
                color: '#1e3a5f',
                fontSize: '0.9rem'
              }}>
                Search
              </label>
              <input
                type="text"
                placeholder="Search by name, email, party or wallet..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1.5px solid #e0e0e0',
                  borderRadius: '0.5rem',
                  fontSize: '0.95rem',
                  outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = '#1e3a5f'}
                onBlur={(e) => e.target.style.borderColor = '#e0e0e0'}
              />
            </div>
            <div style={{ minWidth: '150px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem', 
                fontWeight: '600',
                color: '#1e3a5f',
                fontSize: '0.9rem'
              }}>
                Role
              </label>
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1.5px solid #e0e0e0',
                  borderRadius: '0.5rem',
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  backgroundColor: 'white',
                  outline: 'none'
                }}
              >
                <option value="ALL">All Roles</option>
                <option value="Voter">Voters</option>
                <option value="Candidate">Candidates</option>
                <option value="Organizer">Organizers</option>
              </select>
            </div>
            <div style={{ minWidth: '150px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '0.5rem', 
                fontWeight: '600',
                color: '#1e3a5f',
                fontSize: '0.9rem'
              }}>
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '1.5px solid #e0e0e0',
                  borderRadius: '0.5rem',
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  backgroundColor: 'white',
                  outline: 'none'
                }}
              >
                <option value="ALL">All Status</option>
                <option value="VERIFIED">Verified</option>
                <option value="APPROVED">Approved</option>
                <option value="PENDING_VERIFICATION">Pending Verification</option>
                <option value="PENDING">Pending Approval</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            padding: '4rem',
            textAlign: 'center',
            border: '1px solid #e8e8e8'
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⏳</div>
            <p style={{ color: '#6c757d', fontSize: '1.1rem' }}>Loading users...</p>
          </div>
        ) : (
          <>
            <div style={{ 
              marginBottom: '1rem', 
              color: '#6c757d',
              fontSize: '0.95rem',
              fontWeight: '500'
            }}>
              Showing <strong>{filteredUsers.length}</strong> of <strong>{totalUsers}</strong> users
            </div>

            <div style={{
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
              overflow: 'hidden',
              border: '1px solid #e8e8e8'
            }}>
              {filteredUsers.length === 0 ? (
                <div style={{ padding: '4rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
                  <div style={{ color: '#6c757d', fontSize: '1.1rem' }}>No users found</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ 
                        backgroundColor: '#f8fafc',
                        borderBottom: '2px solid #e2e8f0'
                      }}>
                        <th style={{ padding: '1rem 1.25rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: '#475569' }}>Name</th>
                        <th style={{ padding: '1rem 1.25rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: '#475569' }}>Role</th>
                        <th style={{ padding: '1rem 1.25rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: '#475569' }}>Email</th>
                        <th style={{ padding: '1rem 1.25rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: '#475569' }}>Wallet Address</th>
                        <th style={{ padding: '1rem 1.25rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: '#475569' }}>Status</th>
                        <th style={{ padding: '1rem 1.25rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: '#475569' }}>Registration Time</th>
                        <th style={{ padding: '1rem 1.25rem', textAlign: 'left', fontWeight: '600', fontSize: '0.875rem', color: '#475569' }}>Verification Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user, index) => (
                        <tr 
                          key={user.wallet}
                          style={{ 
                            borderBottom: '1px solid #e8e8e8',
                            transition: 'background-color 0.15s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                        >
                          <td style={{ padding: '1rem 1.25rem', fontWeight: '500', color: '#1e3a5f' }}>
                            {user.name}
                          </td>
                          <td style={{ padding: '1rem 1.25rem' }}>
                            <span style={{
                              padding: '0.375rem 0.875rem',
                              borderRadius: '12px',
                              fontSize: '0.8125rem',
                              fontWeight: '600',
                              backgroundColor: user.role === 'Voter' ? '#dbeafe' : user.role === 'Candidate' ? '#fce7f3' : '#e0e7ff',
                              color: user.role === 'Voter' ? '#1e40af' : user.role === 'Candidate' ? '#9f1239' : '#4338ca'
                            }}>
                              {user.role}
                            </span>
                          </td>
                          <td style={{ padding: '1rem 1.25rem', color: '#495057' }}>
                            {user.email}
                          </td>
                          <td style={{ 
                            padding: '1rem 1.25rem',
                            fontFamily: 'monospace',
                            fontSize: '0.875rem',
                            color: '#6c757d'
                          }}>
                            {user.wallet.substring(0, 6)}...{user.wallet.substring(38)}
                          </td>
                          <td style={{ padding: '1rem 1.25rem' }}>
                            <span style={getStatusBadgeStyle(user.status)}>
                              {user.status === 'VERIFIED' || user.status === 'APPROVED' ? '✓ Verified' : '⏳ Pending'}
                            </span>
                          </td>
                          <td style={{ padding: '1rem 1.25rem', color: '#6c757d', fontSize: '0.875rem' }}>
                            {user.registeredAt.toLocaleDateString()}
                            <br />
                            <span style={{ fontSize: '0.8rem' }}>
                              {user.registeredAt.toLocaleTimeString()}
                            </span>
                          </td>
                          <td style={{ padding: '1rem 1.25rem', color: '#6c757d', fontSize: '0.875rem' }}>
                            {user.verifiedAt ? (
                              <>
                                <span style={{ color: '#6c757d' }}>
                                  {user.verifiedAt.toLocaleDateString()}
                                </span>
                                <br />
                                <span style={{ fontSize: '0.8rem', color: '#6c757d' }}>
                                  {user.verifiedAt.toLocaleTimeString()}
                                </span>
                              </>
                            ) : (
                              <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>
                                Not verified yet
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}